# P0-3 Coins

사용자 Coin의 유일한 진실 공급원. 이후 주문 lock / P2P 이전은 전부 이 모듈을 통한다.

## 목표

Wallet 집계 + Lot(출처별 잔량) + 불변 Ledger. 사용자 write API 없음 (조회만). 지급은 관리자 구매 완료·credit.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| 사용자 조회 | `src/modules/coins/coin.controller.ts` |
| 관리자 | `admin-coin.controller.ts`, `admin-coin-purchase.controller.ts` |
| 도메인 | `coin.service.ts` |
| 금액 연산 | `utils/coin-amount.util.ts` |
| 예외 | `exceptions/coin.exceptions.ts` |

불변식:

```text
lot.original = remaining + locked + consumed
wallet.sellable / lockedSellable / nonSellable 은 lot 합과 맞춰 움직인다
```

## API (`/v1`)

사용자 (Bearer):

- `GET /coins/wallet|history|lots`
- `GET /coins/lots/:lotId`

관리자:

- `GET /admin/users/:userId/coins/wallet|history|lots|lots/:lotId`
- `POST /admin/users/:userId/coins/credit|debit` — **`Idempotency-Key` UUID 필수**
- `POST /admin/users/:userId/coin-purchases` → PENDING
- `POST /admin/coin-purchases/:purchaseId/complete` → Lot+Ledger+Wallet (멱등 아님, 재호출 409)

### 관리자 credit/debit 멱등성

주문 API와 동일하게 `Idempotency-Key: <uuid>` 헤더가 필요하다. 기록은 `admin_coin_adjustment_requests`에 두고, Coin 변경과 **같은 DB 트랜잭션**에서 처리한다.

Unique: `(actor_user_id, idempotency_key)`.

`request_hash` = sha256(키 정렬 canonical JSON):

- credit: `{ operation, targetUserId, amount, sellable, reason }`
- debit: `{ operation, targetUserId, amount, balanceType, reason }`

| 상황 | HTTP | code |
|---|---|---|
| Key 없음 | 400 | `IDEMPOTENCY_KEY_REQUIRED` |
| Key가 UUID 아님 | 400 | `INVALID_IDEMPOTENCY_KEY` |
| 동일 Key·동일 본문·성공 이력 | 200 | 저장된 wallet 응답 재사용 (자산 재변경 없음) |
| 동일 Key·다른 본문 | 409 | `IDEMPOTENCY_KEY_CONFLICT` |
| 동일 Key·처리 중 (`IN_PROGRESS`) | 409 | `REQUEST_IN_PROGRESS` |

실패/재시도:

- Coin 변경이 롤백되면 멱등성 행도 함께 롤백 → 동일 Key 재시도는 신규와 같다.
- 커밋된 `IN_PROGRESS`만 `REQUEST_IN_PROGRESS`다. `updated_at`이 **5분**(`ADMIN_COIN_ADJUSTMENT_IN_PROGRESS_STALE_MS`)보다 오래되면 stale로 보고 재시도 허용.
- 구매 create/complete API는 이번 멱등성 범위 밖이다.

## 코드 패턴

Write는 항상 `EntityManager` + wallet/lots `pessimistic_write`.

| 메서드 | 의미 |
|---|---|
| `creditSellable` / `creditNonSellable` | 새 Lot + ledger + wallet+ |
| `debitSellable` / `debitNonSellable` | **available remaining** FIFO 소비. locked는 안 건드림 |
| `lockSellableInTransaction` | remaining→locked, wallet sellable→lockedSellable (SellOrder 생성) |
| `releaseSellableInTransaction` | locked→remaining (SellOrder remaining 취소) |
| `consumeLockedSellableInTransaction` | locked→consumed, **lockedSellable만 감소** (P0-6 이전). sellable 재차감 금지 |

Ledger `(transaction_id, sequence_no)` UNIQUE. P2P 이전은 **같은 `transaction_id` = trade.id**, seq1 OUT / seq2 IN.

P0-6에서 `reference_type = 'TRADE'` 인 행은 `(reference_type, reference_id, entry_type)` partial unique → 이중 credit 방지.

Brit 구매 Lot은 보통 `is_sellable = false` (nonSellable). P2P 수취 Lot은 `is_sellable = true`, `source_type = P2P_PURCHASE`.

`ADMIN`은 sellable credit 불가. `SYS_ADMIN`만 테스트용 sellable 지급.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `COIN_WALLET_NOT_FOUND` | 404 | 지갑 없음 (가입 TX 실패 아니면 버그) |
| `COIN_WALLET_SUSPENDED` | 409 | 지갑 정지 |
| `COIN_BALANCE_INSUFFICIENT` | 409 | nonSellable 부족 |
| `COIN_SELLABLE_BALANCE_INSUFFICIENT` | 409 | 판매가능/lock 부족 |
| `COIN_LOT_NOT_FOUND` / `COIN_LOT_NOT_AVAILABLE` | 404/409 | Lot |
| `COIN_TRANSACTION_ALREADY_PROCESSED` | 409 | 구매 complete 재호출 |
| `INVALID_COIN_AMOUNT` | 400 | 0·비정수 |
| `ADMIN_COIN_ADJUSTMENT_NOT_ALLOWED` | 403 | ADMIN이 sellable 보정 |
| `COIN_USER_NOT_ACTIVE` | 409 | 대상 유저 비활성 |
| `COIN_PURCHASE_NOT_FOUND` | 404 | |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | credit/debit Key 없음 |
| `INVALID_IDEMPOTENCY_KEY` | 400 | Key가 UUID 아님 |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | 동일 Key·다른 요청 본문 |
| `REQUEST_IN_PROGRESS` | 409 | 동일 Key 처리 중 |

## 주의

1. **`debitSellable`로 P2P 판매 완료를 처리하면 안 된다.** available만 깎는다. 매칭된 물량은 lock 상태 → `consumeLockedSellable`.
2. SellOrder 생성 때 sellable은 이미 wallet에서 locked로 빠진다. Trade 완료 때 sellable을 또 빼면 이중 차감이다.
3. 금액 비교/가감은 `BigInt` 유틸만. DTO도 문자열 (`"200000"`).
4. history type 필터(`BRIT_PURCHASE` / `ADMIN_ADJUSTMENT`)에 P2P entry는 아직 안 묶여 있다. `ALL`로 보인다.
5. `audit_logs`는 관리자 credit/debit만. P2P 이전의 감사는 `coin_ledger_entries` + `trade_events`.
6. Payment 모듈 없음. 실결제 대신 admin complete가 P0 충전 경로다.

## 관리자 수동 보정 감사 (P0-4)

원칙:

```text
audit_logs = 관리자 행동 증명 (누가·누구에게·왜)
coin_ledger_entries = 실제 Coin 증감 증명
```

credit/debit TX와 **같은 DB 트랜잭션**에서 `audit_logs` 생성. `targetType=USER`.

### afterData 스키마 (신규 기록)

Credit (`ADMIN_COIN_CREDIT`):

```json
{
  "transactionId": "ledger-tx-uuid",
  "amount": "20000",
  "balanceType": "NON_SELLABLE",
  "wallet": { "nonSellableBalance": "...", "sellableBalance": "...", ... }
}
```

Debit (`ADMIN_COIN_DEBIT`):

```json
{
  "transactionId": "ledger-tx-uuid",
  "amount": "10000",
  "deduction": { "nonSellableAmount": "10000", "sellableAmount": "0" },
  "wallet": { ... }
}
```

과거 wallet-only `afterData`는 수정하지 않는다.

### 감사 조회 ↔ 원장 추적

감사 목록/상세: `GET /v1/admin/audit-logs` (리더/SYS_ADMIN). 상세 `afterData.transactionId`로 원장 확인:

```http
GET /v1/admin/users/{userId}/coins/history?type=ADMIN_ADJUSTMENT
```

별도 `coin-transactions` API는 P0 범위 밖.
