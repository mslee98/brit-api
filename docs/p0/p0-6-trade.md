# P0-6 Trade 진행

매칭된 Trade를 현금 입금 선언 → 판매자 확인 → Coin 원장 이전 → `COMPLETED`까지 닫는다. 분쟁 **처리**는 P0-7. 여기선 판매자 확인 timeout 시 `DISPUTED` 진입만.

## 목표

```text
WAITING_BUYER_PAYMENT
  ├ 입금 선언 → WAITING_SELLER_CONFIRMATION → 확인 → COIN_TRANSFERRING → COMPLETED
  ├ timeout → PAYMENT_TIMEOUT → (late report | admin ack) 또는 mark-unpaid → CANCELLED
  └ 입금 전 cancel → CANCELLED
WAITING_SELLER_CONFIRMATION
  ├ 판매자 timeout → DISPUTED (+ trade_disputes)
  └ 쌍방취소 4단계 → CANCELLED
```

판매자 확인 ≠ 거래 완료. Coin이 구매자 Lot으로 옮겨야 `COMPLETED`.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| 사용자 HTTP | `src/modules/trades/trades.controller.ts` |
| 관리자 HTTP | `admin-trades.controller.ts` |
| 도메인 | `trade.service.ts` (생성 + progression. UseCase 클래스 없음) |
| Worker | `trade.worker.ts` |
| Coin 소비 | `CoinService.consumeLockedSellableInTransaction` |
| 분쟁 행 | `infrastructure/entities/trade-dispute.entity.ts` |
| 예외 | `exceptions/trade.exceptions.ts` |
| 이벤트 코드 | `domain/enums/trade-event-code.enum.ts` |

## API (`/v1`)

사용자 (당사자만):

| Method | Path | 주체 |
|---|---|---|
| GET | `/trades`, `/trades/:id` | 목록/상세. `actions` 포함 |
| POST | `/trades/:id/payment-report` | 구매자. `PAYMENT_TIMEOUT`에서도 late 허용 |
| POST | `/trades/:id/confirm-payment` | 판매자 |
| POST | `/trades/:id/cancel` | 입금 전만 |
| POST | `/trades/:id/cancellation-request` | 입금 후 당사자 |
| POST | `/trades/:id/cancellation-agreement` | 상대 |
| POST | `/trades/:id/refund-report` | 판매자 현금 반환 선언 |
| POST | `/trades/:id/refund-confirm` | 구매자 환수 확인 → CANCELLED |
| POST | `/trades/:id/mark-unpaid` | 판매자, PAYMENT_TIMEOUT만 |

관리자:

- `GET /admin/trades`, `GET /admin/trades/:id` (events, lots, dispute, 계좌 스냅샷)
- `POST /admin/trades/:id/acknowledge-late-payment`
- `POST /admin/trades/:id/mark-unpaid`

상세 `role`: BUYER면 `payment` (은행명·계좌 전문·dueAt). SELLER면 `payment: null`, 상대 닉네임 마스킹 (`이**`).  
`canOpenDispute`는 이번 단계 항상 `false`.

Idempotency-Key 없음. `Trade FOR UPDATE` + 상태. 같은 버튼 재클릭은 `alreadyReported` / `alreadyConfirmed` 성공.

## 코드 패턴

모든 write: Trade `pessimistic_write` 후 허용 상태인지 검사.

**confirm은 TX 2개**

1. TX A: `WAITING_SELLER_CONFIRMATION` → `COIN_TRANSFERRING` + events
2. TX B: `transferTradeCoin` 전체 원장. 실패해도 confirm은 200 + `COIN_TRANSFERRING`. Worker가 2초 후 재시도.

TX B 안에서 (한 트랜잭션, 중간 실패 시 전부 rollback):

- Trade COMPLETED면 즉시 반환 (멱등)
- Seller lot `locked↓ consumed↑`, wallet `lockedSellable↓` only
- Buyer 새 Lot `P2P_PURCHASE`, `is_sellable=true`, wallet `sellable↑`
- Ledger 같은 `transaction_id = trade.id`
- SellOrder `reserved↓ completed↑`, sell_order_coin_lots `consumed↑`
- BuyOrder `COMPLETED`
- `trade_coin_lots.transferred = allocated`

**취소 시 예약 해제**

- SellOrder가 살아 있으면: `reserved↓ remaining↑`, wallet 그대로, `returned_amount = allocated`
- SellOrder가 이미 `CANCELLED`면: 그 할당량을 `releaseSellable` (wallet locked→sellable)

**입금 전 cancel**

- 구매자: BuyOrder `CANCELLED`
- 판매자: BuyOrder를 `MATCHING` + `nextMatchableAt=now` (재매칭)

**Worker** (`TRADE_TIMEOUT_INTERVAL_MS = 2000`, `isRunning`): buyer timeout → seller timeout → transfer recovery. 건별 `FOR UPDATE SKIP LOCKED`. Redis/Bull 없음. `COIN_TRANSFERRING` 재처리는 `coin_transfer_started_at` 후 `TRANSFER_RECOVERY_MIN_AGE_MS`(2s)가 지나야 한다.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `TRADE_NOT_FOUND` | 404 | (예전 409였음. 고쳤음) |
| `TRADE_ACCESS_DENIED` | 403 | 비당사자 |
| `TRADE_INVALID_STATUS` | 409 | 허용되지 않은 전이 |
| `TRADE_ONLY_BUYER_CAN_REPORT_PAYMENT` | 403 | |
| `TRADE_ONLY_SELLER_CAN_CONFIRM_PAYMENT` | 403 | |
| `TRADE_ONLY_SELLER_CAN_MARK_UNPAID` | 403 | |
| `TRADE_CANNOT_CANCEL_AFTER_PAYMENT` | 409 | 입금 후 단측 cancel |
| `TRADE_ALREADY_COMPLETED` / `TRADE_ALREADY_CANCELLED` | 409 | |
| `TRADE_COIN_TRANSFER_FAILED` | 500 | lot 없음 등 |
| `TRADE_DISPUTE_ALREADY_EXISTS` | 409 | timeout 시 분쟁 행 충돌 |
| `TRADE_INVALID_AMOUNT` / `TRADE_CREATION_FAILED` | 400/500 | 매칭 생성 시 |

`PAYMENT_TIMEOUT`에서 구매자 report는 예외가 아니라 late 성공 (`metadata.late: true`).

## 주의

1. **`PAYMENT_TIMEOUT`은 취소가 아니다.** Coin은 계속 reserved. 미입금은 `mark-unpaid`, 실제 입금은 late report 또는 admin ack.
2. `PAYMENT_TIMEOUT`에서 판매자가 `confirm-payment`를 바로 누르면 `TRADE_INVALID_STATUS`. 먼저 입금 사실을 상태 머신에 올려야 한다.
3. confirm API가 200이어도 status가 `COIN_TRANSFERRING`일 수 있다. 프론트는 `COMPLETED`를 폴링하거나 재조회해야 한다.
4. TX A만 커밋되고 프로세스가 죽으면 Worker가 TX B를 돌린다. recovery 최소 경과 2s + Trade lock으로 confirm 직후 워커와 직렬화한다.
5. 완료 거래를 일반 API로 `CANCELLED`로 돌리지 말 것. 원장 역산이 아니라 분쟁/보정.
6. 쌍방취소는 테이블이 없다. `trade_events` 네 단계. 현금 환불은 오프라인. 시스템이 코인만 예약 해제한다.
7. 구매자 상세의 계좌번호는 스냅샷 **전문**(이체용). 로그에 찍지 말 것. 판매자 응답에는 계좌를 안 내려준다.
8. 인앱 알림함은 P0-6에서 안 붙였다. 화면은 `GET /trades/:id` + `actions`로 만든다. 거래 푸시(신청·수락·입금 신고·완료)는 M7 outbox Web Push다.
9. `trade_dispute_actions` / 강제 완료·증빙 업로드는 **아직 없음**. `DISPUTED` 이후 UI는 P0-7.
10. P2P로 받은 Coin은 다시 팔 수 있다 (`is_sellable=true`). 정책이 바뀌면 credit 호출부만 보면 된다.
