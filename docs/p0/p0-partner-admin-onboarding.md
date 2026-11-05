# P0 Partner — 관리자 온보딩 (B1)

> **문서 상태:** 구현 SoT (2026-11-05 확정)  
> **범위:** BRIT 운영자가 메신저·메일 접수 후 업체를 등록하고, 업체 담당자(Brit 사용자)를 수동 연결한다.  
> **제외:** 외부 업체 HTTP·Intent Embed·lock 테이블 비동기 복구  
> **포함:** Client 발급, 수수료 Admin, 포털 조회, Sandbox CHARGE/REDEEM 실행  
> **폴더:** `src/modules/partners/` + 앱 `brit-partner`

관련: `brit_erd_v4_mvp_45_tables.md` §6·§7, `brit-front/docs/domains/merchant.md`, `brit-front/docs/roadmap/partner-onboarding-policy.md`

---

## 1. 확정 정책

| ID | 항목 | 확정 |
|----|------|------|
| A | 용어 | DB·API·코드 모두 `partner` (`/v1/admin/partners`) |
| B | 등록 상태 | 관리자 등록 즉시 `ACTIVE` |
| B | 상태 전이 | `ACTIVE ↔ SUSPENDED`, `ACTIVE\|SUSPENDED → TERMINATED` (종료 후 재활성 없음) |
| B | SUSPENDED 담당자 | 신규 `partner_members` 추가 허용 |
| B | TERMINATED 담당자 | **추가 불가**, 기존 담당자 **역할 변경·해제만** |
| C | 담당자 대상 | `users.status = ACTIVE`만 |
| C | 소속 수 | 사용자당 **ACTIVE 소속 업체 1개**. 이미 소속이면 추가 금지 → **변경(재배정)**만 |
| C | 역할 | `OWNER` / `MANAGER` |
| D | 1차 연결 | `partner_members`만. `user_partner_links`는 이번 범위 밖 |
| E | Client | Admin 발급·회전·폐기·scopes/origins (`partner_clients` 등) |
| F | 관리자 권한 | `ADMIN` · `SYS_ADMIN` 모두 읽기·쓰기 |
| — | 업체 연락처 | 담당자 이름·전화·이메일·텔레그램 (+ memo). 사업자등록번호 없음 |

### 온보딩 흐름

```text
메신저/메일 접수 (시스템 밖)
→ BRIT 관리자: POST /admin/partners (ACTIVE)
→ 업체 담당자: 일반 회원가입 → 승인(ACTIVE)
→ BRIT 관리자: 사용자 검색 후 partner_members 연결
→ (이후) Client 발급 · SDK · CHARGE
```

### 업체 포털 (`brit-partner`)

담당자 JWT로 조회:

| Method | Path | 설명 |
|--------|------|------|
| GET | `/v1/partner/me` | 소속 업체·역할 |
| GET | `/v1/partner/dashboard` | 일일/누적 수수료·오늘 전환 요약 |
| GET | `/v1/partner/fee-policies` | 산정 근거(정책) |
| GET | `/v1/partner/fee-accruals` | 수수료 발생 내역 |
| GET | `/v1/partner/exchanges` | CHARGE/REDEEM 내역 |

Admin 수수료: `GET|POST /v1/admin/partners/:id/fee-policies`, `POST .../deactivate`.  
Admin 준비: `POST .../assets`, `POST .../user-links`.  
CHARGE/REDEEM: `POST /v1/partner/exchanges/charge|redeem` (Client Secret + scope, 업체 ACTIVE).  
멱등: `(partner_id, idempotency_key)` unique (업체 스코프). Sandbox 동기 경로는 중간 상태 row를 여러 번 저장하지 않고 COMPLETED로 확정.  
포털: SUSPENDED 조회 허용 / TERMINATED 차단. 수수료 표시는 전환과 동일 선택 규칙(exact→ALL).  
스키마: links/assets/exchanges/fees + `partner_coin_wallets` / `partner_coin_ledger_entries`.

---

## 2. 테이블 (1차 마이그레이션)

### partners

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | UUID PK | |
| code | VARCHAR(30) UNIQUE | 내부 코드 |
| name | VARCHAR(100) | |
| status | partner_status | ACTIVE / SUSPENDED / TERMINATED |
| contact_name | VARCHAR(50) | |
| contact_phone | VARCHAR(30) | |
| contact_email | VARCHAR(100) | |
| contact_telegram | VARCHAR(100) NULL | |
| memo | TEXT NULL | 접수 채널·메모 |
| created_at / updated_at | TIMESTAMPTZ | |

사업자등록번호·is_public 등 미사용 컬럼은 넣지 않는다.

### partner_members

| 컬럼 | 타입 |
|------|------|
| id | UUID PK |
| partner_id | UUID FK |
| user_id | UUID FK |
| role | partner_member_role (OWNER / MANAGER) |
| status | partner_member_status (ACTIVE / REMOVED) |
| invited_by_user_id | UUID FK NULL |
| joined_at | TIMESTAMPTZ NULL |
| removed_at | TIMESTAMPTZ NULL |
| created_at / updated_at | TIMESTAMPTZ |

인덱스:

- UNIQUE partial: `(user_id) WHERE status = 'ACTIVE'` — 사용자당 활성 소속 1개
- UNIQUE partial: `(partner_id, user_id) WHERE status = 'ACTIVE'`
- INDEX `(partner_id, status)`

### Client

- `partner_clients` — `client_id` UNIQUE, `environment`, `client_type`, `name`, `webhook_url`, `status`
- `partner_client_secrets` — `secret_hash`만 저장
- `partner_client_scopes` — PK `(partner_client_id, scope_code)`
- `partner_client_origins` — PK `(partner_client_id, origin)`

enum 값:

| Enum | Values |
|------|--------|
| partner_client_environment | SANDBOX, PRODUCTION |
| partner_client_type | SERVER, PUBLIC_SDK |
| partner_client_status | ACTIVE, SUSPENDED, REVOKED |
| partner_client_secret_type | API_SECRET, WEBHOOK_SECRET |
| partner_client_secret_status | ACTIVE, REVOKED |
| partner_client_scope_code | USER_LINK, BALANCE_READ, EXCHANGE_CHARGE, EXCHANGE_REDEEM, STATUS_READ |

---

## 3. Admin API

권한: `JwtAuthGuard` + `RolesGuard(ADMIN|SYS_ADMIN)` + `ActiveAdminGuard`

```text
GET    /v1/admin/partners
POST   /v1/admin/partners
GET    /v1/admin/partners/:partnerId
PATCH  /v1/admin/partners/:partnerId
POST   /v1/admin/partners/:partnerId/suspend
POST   /v1/admin/partners/:partnerId/resume
POST   /v1/admin/partners/:partnerId/terminate

GET    /v1/admin/partners/:partnerId/members
POST   /v1/admin/partners/:partnerId/members              # 신규 연결 (타 업체 ACTIVE 소속 없으면)
POST   /v1/admin/partners/:partnerId/members/reassign     # 타 업체 소속 → 이 업체로 변경
PATCH  /v1/admin/partners/:partnerId/members/:memberId    # role
POST   /v1/admin/partners/:partnerId/members/:memberId/remove

GET    /v1/admin/partners/:partnerId/clients
POST   /v1/admin/partners/:partnerId/clients
GET    /v1/admin/partners/:partnerId/clients/:partnerClientId
PATCH  /v1/admin/partners/:partnerId/clients/:partnerClientId
POST   /v1/admin/partners/:partnerId/clients/:partnerClientId/rotate-secret
POST   /v1/admin/partners/:partnerId/clients/:partnerClientId/revoke
```

### 요청 필드

**Create partner**

- `code`, `name` (필수)
- `contactName`, `contactPhone`, `contactEmail` (필수)
- `contactTelegram`, `memo` (선택)
- `reason` (감사, 필수)

**Update partner** — code 변경 불가. 연락처·name·memo + `reason`

**Member assign** — `userId`, `role`, `reason`  
**Reassign** — `userId`, `role`, `reason` (기존 ACTIVE 멤버십 종료 후 이 업체에 생성)  
**Remove** — `reason`

### 업무 규칙

1. 담당자 연결 대상 `users.status`는 `ACTIVE`만.
2. TERMINATED 업체: assign/reassign 거부. role 변경·remove만.
3. 이미 다른 업체 ACTIVE 멤버인 사용자에게 assign → `PARTNER_MEMBER_ALREADY_ASSIGNED` (reassign 사용).
4. 동일 업체에 이미 ACTIVE면 Conflict.
5. 상태 전이 위반 → `PARTNER_INVALID_STATUS_TRANSITION`.

### 감사 로그

| action_type | target_type |
|-------------|-------------|
| CREATE_PARTNER | PARTNER |
| UPDATE_PARTNER | PARTNER |
| SUSPEND_PARTNER | PARTNER |
| RESUME_PARTNER | PARTNER |
| TERMINATE_PARTNER | PARTNER |
| ASSIGN_PARTNER_MEMBER | PARTNER_MEMBER |
| REASSIGN_PARTNER_MEMBER | PARTNER_MEMBER |
| CHANGE_PARTNER_MEMBER_ROLE | PARTNER_MEMBER |
| REMOVE_PARTNER_MEMBER | PARTNER_MEMBER |
| CREATE_PARTNER_CLIENT | PARTNER_CLIENT |
| UPDATE_PARTNER_CLIENT | PARTNER_CLIENT |
| ROTATE_PARTNER_CLIENT_SECRET | PARTNER_CLIENT |
| REVOKE_PARTNER_CLIENT | PARTNER_CLIENT |

### Client 규칙

1. TERMINATED 업체: Client 신규 발급 불가.
2. `clientId`(공개) ≠ DB PK `id`. SDK에는 `clientId`만.
3. SERVER: 발급·회전 시 `apiSecretPlaintext` 한 번만 반환. DB는 `secret_hash`(bcrypt).
4. PUBLIC_SDK: Origin 1개 이상 필수. API Secret 없음.
5. Scope 1개 이상 필수.

---

## 4. 관리자 화면 필드

| 화면 | 필드 |
|------|------|
| 목록 | code, name, status, contactName, contactPhone, updatedAt |
| 등록/수정 | code(등록만), name, contactName, contactPhone, contactEmail, contactTelegram, memo, reason |
| 상세 | 위 + 상태 액션(중지/재개/종료) |
| 담당자 탭 | loginId, nickname/실명, role, status, joinedAt · 연결/재배정/역할변경/해제 |
| Client 탭 | clientId, environment, clientType, status, scopes · 발급/Secret회전/폐기 |

검색: 업체 code·name·담당자 연락처. 담당자 연결 시 사용자 loginId·전화 검색(기존 users 검색 패턴 재사용).

---

## 5. 예외 code

| code | 의미 |
|------|------|
| PARTNER_NOT_FOUND | 업체 없음 |
| PARTNER_CODE_DUPLICATE | code 중복 |
| PARTNER_INVALID_STATUS_TRANSITION | 상태 전이 불가 |
| PARTNER_TERMINATED | 종료 업체에 추가 연결 불가 |
| PARTNER_MEMBER_NOT_FOUND | 멤버 없음 |
| PARTNER_MEMBER_USER_NOT_ACTIVE | 사용자 ACTIVE 아님 |
| PARTNER_MEMBER_ALREADY_ASSIGNED | 타 업체 소속 → reassign 필요 |
| PARTNER_MEMBER_ALREADY_ON_PARTNER | 이미 이 업체 소속 |
| PARTNER_MEMBER_NOT_ASSIGNED | reassign 대상 소속 없음 |
| PARTNER_CLIENT_NOT_FOUND | Client 없음 |
| PARTNER_CLIENT_REVOKED | 이미 폐기 |
| PARTNER_CLIENT_NOT_ACTIVE | ACTIVE만 Secret 회전 |
| PARTNER_CLIENT_SECRET_NOT_APPLICABLE | SERVER만 Secret |
| PARTNER_CLIENT_SCOPES_REQUIRED | Scope 필요 |
| PARTNER_CLIENT_ORIGINS_REQUIRED | PUBLIC_SDK Origin 필요 |

---

## 6. 구현 체크

- [x] 정책·API 문서
- [x] Migration + Entity (`1753380000000-AddPartnerAdminOnboarding`)
- [x] PartnersService + AdminPartnersController
- [x] Audit enum
- [x] brit-admin `features/partners`
- [x] Client 발급 API·Admin UI
- [x] 업체 포털 (`brit-partner`) 조회·Sandbox CHARGE/REDEEM
- [x] idempotency partner-scope + Partners/Members 단위 테스트
