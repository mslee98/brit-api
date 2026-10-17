# P0 구현 메모 (brit-api)

P0-1 ~ P0-6까지 **실제로 들어간 코드**를 이후 작업에서 참조하기 위한 메모다.  
스펙 초안이 아니라 현재 구현이 기준이다. ERD는 [`brit_erd_v4_mvp_45_tables.md`](../../brit_erd_v4_mvp_45_tables.md).

| 단계 | 파일 | 한 줄 |
|---|---|---|
| P0-1 Auth | [p0-1-auth.md](./p0-1-auth.md) | 세션 JWT, 로그인 정책, Guard |
| P0-2 가입심사 | [p0-2-registration.md](./p0-2-registration.md) | register → PENDING → 관리자 승인 |
| P0-3 Coins | [p0-3-coins.md](./p0-3-coins.md) | Wallet / Lot / Ledger |
| P0-4 Orders | [p0-4-orders.md](./p0-4-orders.md) | Buy/Sell 주문, Lot lock |
| P0-5 Matching | [p0-5-matching.md](./p0-5-matching.md) | Browse+Select 후보·match TX |
| P0-5b (M1~M4) | [p0-5b-seller-accept.md](./p0-5b-seller-accept.md) | Apply→Accept/Expire + release (코드) |
| P0-5b M1~M4 계획 | [p0-5b-m1-m4-plan.md](./p0-5b-m1-m4-plan.md) | 백엔드 뼈대 지시서 (M1~M4 Done) |
| P0-6 Trade | [p0-6-trade.md](./p0-6-trade.md) | 입금·확인·Coin 이전·timeout |
| P0-7 분쟁 (M1~M3) | [p0-7-disputes.md](./p0-7-disputes.md) | deny/open → DISPUTED, 큐·배정, 삼자 채팅 REST, admin resolve |
| Admin Foundation | [p0-admin-foundation.md](./p0-admin-foundation.md) | 관리자 인증·권한·감사·은행 |

다음 예정: **P0-5b M5~M7** (Front·Push). P0-5b M1~M4 백엔드 코어는 완료. P0-7 M3 Socket·M4 철회/매크로/증빙까지 완료.

UX·정책 전문: [brit-front/docs/porcess/trade-seller-accept-flow.md](../../../brit-front/docs/porcess/trade-seller-accept-flow.md).

---

## 전역 규칙 (모든 단계에서 동일)

### HTTP

- Prefix: `/v1` ([`src/main.ts`](../../src/main.ts)). Swagger는 `/docs`. 은행 아이콘 등 static은 `/assets/...` (prefix 제외).
- ValidationPipe: `whitelist` + `forbidNonWhitelisted` + `transform`.
- 응답 래퍼 `{ success, data }` 없음. 본문 = DTO, 실패는 HTTP 상태 + `code`.
- 생성 `201`, 본문 없는 수정 `204`, 명령성 POST는 대체로 `200`.
- 목록: `{ items, pagination: { page, size, totalItems, totalPages } }`. `page` 기본 1, `size` 기본 20, max 100.

오류 본문 ([`HttpExceptionFilter`](../../src/common/filters/http-exception.filter.ts)):

```json
{ "statusCode": 409, "code": "TRADE_INVALID_STATUS", "message": "…", "path": "/v1/…", "timestamp": "…" }
```

프론트는 **`code`로 분기**. 메시지는 한국어 해요체.

### 예외 패턴

도메인마다 `*DomainException` static factory.

```ts
throw TradeDomainException.invalidStatus();
// → new ConflictException({ code: 'TRADE_INVALID_STATUS', message: '…' })
```

- `throw new Error` / `{ success: false }` 금지.
- 형식 검증은 DTO(`class-validator`). 업무 규칙은 Service.
- 같은 사용자·같은 명령의 재시도는 409보다 **멱등 성공**을 쓰는 경우가 있다 (주문 Idempotency-Key, Trade 입금/확인 버튼).

### 모듈·계층

도메인 폴더 (`modules/{domain}/`). Controller는 라우팅만, Service가 TX·상태전이.

금지 (과설계):

- use-case 클래스 / StateService / Repository 래퍼
- 구현체 1개인 Strategy/Factory
- 타 모듈 Entity Repository 주입 — **예외: Matching·Trades는 Orders 순환을 피하려고 Buy/Sell 엔티티를 `TypeOrmModule.forFeature`로 직접 쓴다**

금액은 전부 **bigint 문자열**. float 금지. 연산은 [`coin-amount.util.ts`](../../src/modules/coins/utils/coin-amount.util.ts).

### 동시성

잔액·주문 수량·Trade 상태는 `find` 후 그냥 `save`로 끝내지 않는다.

- `manager.findOne({ lock: { mode: 'pessimistic_write' } })`
- 매칭 사용자 선택: Sell `FOR UPDATE` (SKIP LOCKED 없음). Trade timeout Worker: `FOR UPDATE SKIP LOCKED`
- Unique index가 최종 방어 (idempotency, ledger `(reference_type, reference_id, entry_type)` 등)
- Worker는 `@nestjs/schedule` `@Interval` + 프로세스 내 `isRunning`. Redis/Bull 없음. 다중 인스턴스의 실방어는 DB lock.

### 인증

- 사용자 API: `JwtAuthGuard` (`Authorization: Bearer`).
- 관리자: `JwtAuthGuard` + `RolesGuard` + `@Roles(ADMIN, SYS_ADMIN)`.
- JWT payload: `sub`, `sid`, `role`, `status`, `tokenType`. Guard가 `user_sessions` ACTIVE/만료를 DB에서 재검증.

### 작업 시 체크

1. 기존 같은 도메인 파일의 폴더·예외·DTO `from()` 패턴을 먼저 본다.
2. 상태 전이는 “덮어쓰기”가 아니라 허용 전이를 검사한다.
3. 여러 테이블이면 Service에서 `dataSource.transaction`.
4. Entity 변경 시 migration을 같이 둔다. (로컬 `synchronize: true`가 켜져 있어도 운영 전제는 migration.)
5. 완료된 P2P/원장 행을 UPDATE/DELETE로 “고치지” 않는다. 보정은 새 ledger / 분쟁.
