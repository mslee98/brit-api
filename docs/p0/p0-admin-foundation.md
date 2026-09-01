# P0 Admin Foundation

관리자 API 기반(인증·권한·감사·은행 기준정보). 사용자 P0-1~6과 별도 진입점이지만 동일 `users` / `user_sessions`를 사용한다.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| 모듈 | `src/modules/admins/admins.module.ts` |
| 관리자 로그인 | `admin-auth.controller.ts` / `admin-auth.service.ts` |
| 관리자 계정 | `admin-management.controller.ts` / `admin-management.service.ts` |
| 감사 로그 | `audit-log.controller.ts` / `audit-log.service.ts` |
| 프로필 엔티티 | `infrastructure/entities/admin-profile.entity.ts` |
| Guard | `guards/active-admin.guard.ts`, `admin-permission.guard.ts` |
| 은행 관리 | `src/modules/banks/admin-banks.controller.ts` |
| 공용 세션/JWT | `src/modules/auth/auth.service.ts` (`clientType`, rotation/reuse) |

## 정책

- Refresh: JSON body (`accessToken` + `refreshToken` + `expiresInSec`). 쿠키 없음.
- 관리자 로그인: `POST /v1/admin/auth/login` 전용.
- 일반 `POST /v1/auth/login`: ACTIVE ADMIN/SYS_ADMIN → `403 ADMIN_LOGIN_REQUIRED`.
- Access JWT: 기존 claim + `clientType: 'ADMIN' | 'USER'`. 민감 권한은 JWT에 넣지 않고 DB 재검증.
- TTL(관리자): `JWT_ADMIN_ACCESS_EXPIRES_SEC=900`, `JWT_ADMIN_REFRESH_EXPIRES_SEC=604800`.
- Refresh Rotation + `previous_refresh_token_hash` 재사용 감지 → 전체 세션 revoke (`REFRESH_TOKEN_REUSE`).
- 관리자 P2P: `UserService.assertP2pEligibleInTransaction`에서 ACTIVE ADMIN/SYS_ADMIN 차단.

## JWT 역할 선택 (현재 — `roles[]` 없음)

`user_roles`는 UUID PK 이력형이라 **ACTIVE 역할 다건이 DB상 가능하다**. UNIQUE(user_id) WHERE ACTIVE 제약은 없다. JWT claim은 여전히 단일 `role`이다.

| 경로 | 선택 규칙 |
|---|---|
| 사용자 로그인 (`/auth/login`, refresh) | `UserService.getPrimaryRole` = ACTIVE 중 `grantedAt ASC` **최초 1개** (없으면 `USER`) |
| 관리자 로그인 (`/admin/auth/login`, refresh) | `UserService.getHighestAdminRole` = ACTIVE 중 **SYS_ADMIN 우선**, 없으면 ADMIN |
| RolesGuard | JWT의 단일 `role`만 비교 |

ADMIN과 SYS_ADMIN이 동시에 ACTIVE여도 DB는 허용한다. 관리자 JWT에는 SYS_ADMIN만 실린다.

후속(미구현): 복수 역할을 제품하면 `roles[]` 인증 버전 전환. 단일만 강제하려면 partial unique `(user_id) WHERE status=ACTIVE` 검토.

## 접근 조건 (관리자 API)

```text
JwtAuthGuard
→ RolesGuard (ADMIN | SYS_ADMIN)
→ ActiveAdminGuard (clientType=ADMIN + ACTIVE 역할 + admin_profiles.is_active)
→ (선택) AdminPermissionGuard / @Roles(SYS_ADMIN)
```

## 관리자 계정·권한 (P0-2)

목록/상세: **SYS_ADMIN 또는 `admin_profiles.isLeader`**. 변경 API는 **SYS_ADMIN**만.

| Method | Path | 비고 |
|---|---|---|
| GET | `/admin/admins` | 리더/SYS_ADMIN |
| GET | `/admin/admins/:adminId` | 본인 또는 리더/SYS_ADMIN |
| POST | `/admin/admins` | 승격. TX 내 기존 세션 전부 폐기 (`ADMIN_ROLE_GRANTED`) |
| PATCH | `/admin/admins/:adminId/profile` | 등급·리더 |
| PUT | `/admin/admins/:adminId/permissions` | 민감 권한. 변경 후 세션 폐기 |
| POST | `/admin/admins/:adminId/activate` | `users.ACTIVE` + ACTIVE ADMIN/SYS_ADMIN + `is_active=false`. 이미 active면 `ADMIN_ALREADY_ACTIVE` |
| POST | `/admin/admins/:adminId/deactivate` | `is_active=false`만. **세션 항상 폐기**. 자기 자신·마지막 SYS_ADMIN 차단 |
| POST | `/admin/admins/:adminId/revoke-role` | 역할 REVOKED + 프로필 비활성 + 세션 폐기 |
| POST | `/admin/admins/:adminId/revoke-sessions` | `{ reason }` → `{ revokedSessionCount }`, audit `REVOKE_ADMIN_SESSIONS` |

동시성: 변경 TX에서 대상 `admin_profiles`/`user_roles`를 `pessimistic_write`로 잠그고, 마지막 SYS_ADMIN은 `UserService.lockAndCountActiveSysAdmins`로 FOR UPDATE 후 판정.

관리자별 감사는 전역 API 필터 재사용 (전용 Endpoint 없음).

```text
수행 이력: GET /v1/admin/audit-logs?actorUserId={adminId}
대상 변경: GET /v1/admin/audit-logs?targetType=ADMIN_PROFILE&targetId={adminId}
```

actor∪target 단일 타임라인은 후속.

## API (`/v1`)

| Method | Path | 비고 |
|---|---|---|
| POST | `/admin/auth/login` | 공개 |
| POST | `/admin/auth/refresh` | body refreshToken |
| POST | `/admin/auth/logout` | Bearer 또는 refreshToken |
| GET | `/admin/auth/me` | |
| GET/DELETE | `/admin/auth/sessions*` | 본인 세션 |
| GET/POST/… | `/admin/admins*` | 목록은 리더/SYS_ADMIN, 변경은 SYS_ADMIN |
| GET | `/admin/audit-logs*` | 리더/SYS_ADMIN. `actorUserId`/`targetType`/`targetId`/`actionType`/`actionTypes` 필터 |

## P0-4 관리자 수동 Coin 보정 감사

별도 `coin-adjustments` API 없음. 기존 감사 로그 API로 조회한다.

| Method | Path | 비고 |
|---|---|---|
| GET | `/admin/audit-logs` | Coin 보정 목록. 목록 응답에 `actor.name`, `target`, `coinAdjustment` 요약 포함 |
| GET | `/admin/audit-logs/:auditLogId` | 상세. `beforeData`/`afterData` 전체 + 동일 요약 필드 |

권한: **리더 ADMIN 또는 SYS_ADMIN** (일반 ADMIN `403 FORBIDDEN`).

### Coin 보정 조회 예시

특정 사용자 지급 이력:

```http
GET /v1/admin/audit-logs?actionType=ADMIN_COIN_CREDIT&targetType=USER&targetId={userId}
```

특정 관리자 지급 이력:

```http
GET /v1/admin/audit-logs?actionType=ADMIN_COIN_CREDIT&actorUserId={adminId}
```

지급·차감 전체:

```http
GET /v1/admin/audit-logs?actionTypes=ADMIN_COIN_CREDIT&actionTypes=ADMIN_COIN_DEBIT
```

목록 `coinAdjustment` 필드: `transactionId`, `amount`, `balanceType`(credit), `deduction`(debit). 구형 레코드(wallet-only `afterData`)는 `null`.

| GET | `/admin/banks` · `/admin/banks/:bankId` | 리더/SYS_ADMIN. 비활성 포함 |
| POST/PATCH | `/admin/banks*` · `.../activate` · `.../deactivate` | SYS_ADMIN. 생성 시 `isActive=false`. 이미 동일 상태면 `409` |
| GET | `/banks` · `/banks/:bankId` | 공개. `isActive=true`만. Bearer 불필요 |

## 은행 기준정보

- 물리 삭제 API 없음. 비활성(`is_active=false`)만 — 기존 계좌·거래는 유지.
- `code`는 생성 후 변경 불가 (Update DTO에 필드 없음).
- 점검시간(`dailyMaintenance*`, `regularMaintenanceRule`, `maintenanceNote`)은 **안내용**. 거래/가입 자동 차단에 쓰지 않음.
- 일일 점검 시작·종료는 둘 다 있거나 둘 다 없음 (`INVALID_MAINTENANCE_TIME`).
- 활성화 전 `iconKey`·`svgFilename` 필수 (`BANK_ICON_REQUIRED`).
- 감사: `CREATE_BANK` / `UPDATE_BANK` / `ACTIVATE_BANK` / `DEACTIVATE_BANK`. `targetType=BANK`, `targetId`=은행 id 문자열, `reason` 필수.
- `audit_logs.target_id`는 varchar(64) — UUID뿐 아니라 은행 smallint id도 저장.

## 예외 code (주요)

| code | 언제 |
|---|---|
| `AUTH_INVALID_CREDENTIALS` | ID/PW 불일치 |
| `ACCOUNT_NOT_ACTIVE` | users.status ≠ ACTIVE |
| `ADMIN_ROLE_REQUIRED` | 관리자 역할 없음 (로그인·activate 포함) |
| `ADMIN_PROFILE_NOT_CONFIGURED` | admin_profiles 없음 |
| `ADMIN_PROFILE_INACTIVE` | 업무 중지 |
| `ADMIN_ALREADY_ACTIVE` | activate 시 이미 `is_active=true` |
| `ADMIN_LOGIN_REQUIRED` | 일반 로그인으로 관리자 시도 |
| `REFRESH_TOKEN_REUSE` | 과거 Refresh 재사용 |
| `LAST_SYS_ADMIN_REQUIRED` | 마지막 SYS_ADMIN 제거 시도 |
| `SELF_DEACTIVATION_NOT_ALLOWED` | 본인 비활성·역할 회수 |
| `ALREADY_ADMIN` | 이미 활성 관리자 역할 |
| `USER_NOT_ACTIVE` | 비 ACTIVE 사용자 승격/활성화 |
| `DUPLICATE_BANK_CODE` | 은행 코드 중복 |
| `BANK_NOT_FOUND` | 은행 없음 (또는 공개 API에서 비활성) |
| `BANK_ALREADY_ACTIVE` | 은행 activate 시 이미 활성 |
| `BANK_ALREADY_INACTIVE` | 은행 deactivate 시 이미 비활성 |
| `INVALID_MAINTENANCE_TIME` | 일일 점검 시작·종료 한쪽만 입력 |
| `BANK_ICON_REQUIRED` | 아이콘 없이 활성화 시도 |
| `FORBIDDEN` | 리더가 아닌 ADMIN의 은행/감사/관리자 목록 조회 |

## Seed

```bash
SEED_SYS_ADMIN_PASSWORD=... npm run seed:sys-admin
```

기존 `sysadmin`이 있으면 `admin_profiles`만 backfill한다.

## 후속

- HttpOnly Cookie 전환은 사용자·관리자 인증 정책을 함께 검토.
- CSP 강화는 brit-admin 후속.
- 가입 승인·Coin 보정·거래 강제처리는 기존 admin 컨트롤러 + ActiveAdminGuard 위에 확장.
- 관리자 actor∪target 감사 타임라인 API.
