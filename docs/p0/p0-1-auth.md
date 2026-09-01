# P0-1 Auth

세션 기반 JWT. 가입 신청과 심사는 [P0-2](./p0-2-registration.md).

## 목표

로그인·토큰 갱신·로그아웃·`/auth/me`. 토큰만 믿지 않고 **세션 행이 ACTIVE인지** 매번 확인한다.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| HTTP | `src/modules/auth/auth.controller.ts` |
| 유스케이스 | `src/modules/auth/auth.service.ts` |
| Guard | `src/modules/auth/guards/jwt-auth.guard.ts` |
| Guard 모듈 (순환 끊기) | `src/modules/auth/auth-guards.module.ts` |
| 세션 엔티티 | `src/modules/auth/infrastructure/entities/user-session.entity.ts` |
| 예외 | `src/modules/auth/exceptions/auth.exceptions.ts` |
| 현재 사용자 | `src/common/decorators/current-user.decorator.ts` |
| 역할 가드 | `src/common/guards/roles.guard.ts` |

Auth는 User Entity를 직접 수정하지 않는다. 조회·프로필은 `UserService`.

## API (`/v1`)

| Method | Path | 인증 | 비고 |
|---|---|---|---|
| POST | `/auth/login-id/check` | | 가입 전 중복 |
| POST | `/auth/nickname/check` | | 가입 전 중복 |
| POST | `/auth/register` | | P0-2. 토큰 없음 |
| POST | `/auth/login` | | ACTIVE/PENDING/REJECTED |
| POST | `/auth/refresh` | body refreshToken | 로테이션 |
| POST | `/auth/logout` | Bearer | 현재 세션 revoke, 204 |
| POST | `/auth/logout-all` | Bearer | 전체 세션, 204 |
| GET | `/auth/me` | Bearer | status, nextAction, canTrade |
| GET | `/auth/registration-status` | Bearer | P0-2 |
| PATCH | `/auth/registration` | Bearer | P0-2 재제출 |

레거시 `POST /auth/signup` 은 제거됐다. `register`만 쓴다.

## 코드 패턴

- Access JWT: `sub`(userId), `sid`(sessionId), `role`, `status`, `tokenType: 'access'` (+ 관리자/사용자 `clientType`).
- JWT `role`은 단일 값이다. ACTIVE `user_roles`가 여러 개여도:
  - 사용자 로그인: `getPrimaryRole` = ACTIVE 중 `grantedAt ASC` 최초 1개
  - 관리자 로그인: `getHighestAdminRole` = SYS_ADMIN 우선, 없으면 ADMIN
  - `RolesGuard`는 JWT의 그 한 값만 본다 (`roles[]` 미사용)
- Refresh는 DB에 **해시**만. 평문 토큰 저장 금지.
- `JwtAuthGuard`: JWT 검증 → `user_sessions`에서 `sid` ACTIVE·미만료 확인. 아니면 401.
- Users/Notifications가 AuthModule을 안 끌어가게 `AuthGuardsModule`만 import.
- 로그인 응답 `nextAction`: `NONE` | `WAIT_FOR_APPROVAL` | `ACTION_REQUIRED`.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | 아이디/비번 틀림 (존재 여부 노출 금지) |
| `INVALID_REFRESH_TOKEN` | 401 | refresh 실패·세션 없음 |
| `ACCOUNT_SUSPENDED` | 403 | 정지 계정 로그인 |
| `ACCOUNT_WITHDRAWN` | 403 | 탈퇴 계정 로그인 |
| `LOGIN_ID_ALREADY_EXISTS` | 409 | 중복 아이디 |
| `NICKNAME_ALREADY_EXISTS` | 409 | 중복 닉네임 |

형식 오류(`INVALID_LOGIN_ID` 등)는 P0-2 register DTO와 공유.

## 주의

1. **로그인 허용 상태**는 `ACTIVE | PENDING | REJECTED`다. `user-status.enum.ts` 주석의 “PENDING 로그인 불가”와 **코드가 다르다**. 구현(`assertLoginAllowed`)을 따른다.
2. PENDING/REJECTED는 로그인되지만 `permissions.canTrade === false`. 주문 API는 별도로 `assertP2pEligible` (ACTIVE + ACTIVE 계좌).
3. 정지/탈퇴 시 `UserService`가 ACTIVE 세션을 일괄 revoke한다. 이미 발급된 JWT는 Guard의 세션 재검증에서 막힌다.
4. 프론트 localStorage에 `status: authenticated`만 있고 토큰이 없으면 UI는 로그인으로 보여도 API는 401이다.
5. `pendingApproval()` (`PENDING_APPROVAL`)·`accountRejected()` (`ACCOUNT_REJECTED`)는 예외 팩토리에 남아 있지만, 로그인은 PENDING/REJECTED를 막지 않는다. 거래 차단은 `canTrade`/주문 가드로 한다.
