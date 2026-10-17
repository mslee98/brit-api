# P0-2 회원가입 / 가입심사

ERD v4 기준 가입 한 건 = 사용자 + 프로필 + 계좌 + 동의 + 빈 지갑. 관리자가 **가입 정보와 최초 계좌를 한 번에** 심사한다.

## 목표

```text
register (PENDING, 토큰 없음)
  → (제한) 로그인 + registration-status
  → 관리자 approve / reject
  → ACTIVE + 계좌 ACTIVE  또는  REJECTED 후 재제출
```

외부 본인인증·계좌인증 API 없음. 계좌는 제출만, `PENDING_APPROVAL`.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| 가입 HTTP | `src/modules/auth/auth.controller.ts` (`register`, `registration-status`, `PATCH registration`) |
| 심사 HTTP | `src/modules/users/admin-user-approvals.controller.ts` |
| 사용자 운영 | `src/modules/users/admin-user.controller.ts` (정지/해제/탈퇴) |
| 도메인 | `src/modules/users/user.service.ts` |
| 은행 마스터 | `src/modules/banks/banks.controller.ts` `GET /banks` |
| 가입 알림 | `src/modules/notifications/notification.service.ts` |
| 예외 | `user-approval.exceptions.ts`, `user-admin.exceptions.ts`, `auth.exceptions.ts` |

엔티티: `users`, `user_profiles`, `user_consents`, `user_bank_accounts`, `user_approval_reviews`, `user_bank_account_reviews`, `user_coin_wallets`(가입 TX에서 0원 생성).

## API (`/v1`)

사용자:

| Method | Path | 설명 |
|---|---|---|
| GET | `/banks` · `/banks/:bankId` | 활성 은행만 (아이콘 URL 포함). Bearer 불필요 |
| POST | `/auth/register` | 201, `{ userId, status, nextAction: WAIT_FOR_APPROVAL }` |
| GET | `/auth/registration-status` | UNDER_REVIEW / ACTION_REQUIRED / COMPLETED |
| PATCH | `/auth/registration` | REJECTED 재제출 → 다시 PENDING |

관리자 (`ADMIN` \| `SYS_ADMIN`):

| Method | Path | 설명 |
|---|---|---|
| GET | `/admin/registration-reviews` | 심사 목록 |
| GET | `/admin/registration-reviews/:userId` | 상세 (주민번호·계좌 마스킹 정책 준수) |
| POST | `/admin/registration-reviews/:userId/approve` | 체크리스트 필수 |
| POST | `/admin/registration-reviews/:userId/reject` | reason 필수 |
| GET/POST | `/admin/users`, `.../suspend\|unsuspend\|withdraw` | 운영 |
| GET | `/admin/users/:userId/ops-snapshot` | Coin·거래·분쟁 요약. `cancelledTrades`(status=CANCELLED), `forceCompletedDisputes`(resolution=FORCE_COMPLETE) |

알림 (관리자 인박스): `GET/PATCH /admin/notifications…`

## 코드 패턴

- **한 TX**: user + profile + USER role + consents + bank account + empty wallet + 관리자 알림 사건.
- 계좌번호: 암호문 저장, 응답은 마스킹. Trade 스냅샷(P0-5)만 거래용 평문을 별도 컬럼에 둔다.
- 주민번호: ERD 정책상 프로필에 평문. **API/로그/감사에 전문 금지**.
- 승인 시 `users.ACTIVE` + 해당 계좌 `ACTIVE` + `user_approval_reviews` / `user_bank_account_reviews` 불변 이력.
- 승인 체크리스트: 신원·전화·계좌·예금주 확인이 모두 true여야 한다.
- 알림: `createEventWithRecipientsInTransaction`. 가입 요청은 ACTIVE 관리자에게. 신청자 APPROVED/REJECTED 행은 저장하지만 미로그인 상태에서는 인앱 조회 대상이 아니다.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `CONSENT_REQUIRED` / `DUPLICATE_CONSENT` | 400 | 약관 |
| `INVALID_BANK_CODE` / `INVALID_ACCOUNT_NUMBER` | 400 | 계좌 형식 |
| `PHONE_ALREADY_EXISTS` | 409 | 전화 중복 |
| `RESIDENT_NUMBER_ALREADY_EXISTS` | 409 | 동일 신원 |
| `ACCOUNT_NUMBER_TAKEN` | 409 | 계좌 중복 |
| `NAME_MISMATCH` | 422 | 예금주 불일치 정책 |
| `USER_APPROVAL_NOT_FOUND` | 404 | 심사 대상 없음 |
| `USER_APPROVAL_NOT_PENDING` | 409 | 이미 처리됨 |
| `USER_APPROVAL_BANK_ACCOUNT_NOT_FOUND` | 404 | 승인할 가입 계좌 없음 |
| `USER_APPROVAL_CHECKLIST_INCOMPLETE` | 400 | 승인 체크 미완 |
| `USER_APPROVAL_REJECTION_REASON_REQUIRED` | 400 | 반려 사유 없음 |
| `CANNOT_MODIFY_SELF` | 403 | 관리자 본인 정지/탈퇴 |
| `INVALID_STATUS_TRANSITION` | 409 | 정지/탈퇴 불가 상태 |
| `REASON_REQUIRED` | 400 | 정지/탈퇴 사유 없음 |
| `NOTIFICATION_NOT_FOUND` / `NOTIFICATION_FORBIDDEN` | 404/403 | 알림 |

## 주의

1. register는 **토큰을 안 준다**. 프론트는 Complete 화면 후 로그인 플로우로 보낸다.
2. 사용자 상태와 계좌 상태가 분리돼 있다. 승인 API가 둘을 같이 올린다. 계좌만 따로 승인하는 P0 API는 없다.
3. `GET /banks`의 아이콘은 `ASSET_PUBLIC_BASE_URL` + `/assets/...`. API 서버가 static을 서빙한다.
4. 탈퇴는 상태 `WITHDRAWN` + 세션 revoke. 익명화/하드삭제는 하지 않는다.
5. P2P 참여는 이 단계 다음: `UserService.assertP2pEligibleInTransaction` (ACTIVE 유저 + ACTIVE 계좌 ≥ 1). [P0-4](./p0-4-orders.md)에서 호출.
