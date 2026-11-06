# P0-4 Buy / Sell Orders

매칭 전 단계. 판매는 전액 Lot lock, 구매는 Coin lock 없이 `MATCHING` 탐색 세션만 만든다. 판매자 선택·Trade 생성은 [P0-5](./p0-5-matching.md).

## 목표

```text
ACTIVE + ACTIVE 계좌
  → POST /sell-orders  (sellable 전액 lock, OPEN)
  → POST /buy-orders   (MATCHING만 — 자동 Trade 없음)
  → GET  /buy-orders/:id/candidates
  → POST /buy-orders/:id/match
```

## 핵심 파일

| 역할 | 경로 |
|---|---|
| HTTP | `buy-order.controller.ts`, `sell-order.controller.ts`, `admin-orders.controller.ts` |
| 도메인 | `buy-order.service.ts`, `sell-order.service.ts` |
| 정책 | `infrastructure/entities/matching-policy.entity.ts` |
| 번호 | `utils/order-number.util.ts` (`BO`/`SO`/`TO`/`TD`) |
| 상태 계산 | `utils/sell-order-status.util.ts` |
| 예외 | `exceptions/order.exceptions.ts` |
| 주문 소켓 | `realtime/order.gateway.ts` (`/orders`) |
| 발행 | `realtime/order-realtime.publisher.ts` |

Buy 생성은 `MATCHING` 주문만 반환한다. 즉시 매칭하지 않는다.

## 실시간

쓰기는 REST. emit은 커밋 뒤. payload는 id와 status만.

- `buy-order.updated`: 구매 생성·취소·매칭 상태 변경
- `sell-order.updated`: 판매 생성·취소·잔량 변경
- `trade-request.updated`: 신청 생성·수락·거절·취소·만료. 구매·판매 신호도 같이 보낸다
- `matching.changed`: 판매 잔량이 바뀐 뒤, 바뀐 잔량(전·후)이 NEAR 범위에 드는 `MATCHING` 구매의 `buy-order:{id}` 방에만 보낸다. 금액이 먼 구매는 받지 않는다. 같은 방은 300ms 안에 첫 신호와 마지막 신호 한 번씩만 나간다(서버 메모리, 단일 인스턴스 기준). 이 이벤트만 payload에 `changes: [{ sellOrderId, remaining }]`를 싣는다. `remaining`은 발행 시점에 다시 읽은 값이고, 후보가 아니게 된 판매(예약·취소·체결)는 `'0'`이다. 합쳐진 신호는 판매별 마지막 값만 담는다

인증·끊김 복구는 `/trades`와 같다([p0-6-trade.md](./p0-6-trade.md) 「실시간」). 연결 시 `user:{userId}` join. 매칭 대기만 `buy-order.join` / `leave`이고, 재연결 때 클라이언트가 다시 join한다. join은 본인 구매일 때만 받는다(`BUY_ORDER_NOT_FOUND`). 프론트는 `remaining: '0'`인 후보를 목록에서 바로 빼고, 빠지기만 한 신호면 GET을 하지 않는다. 새 판매가 생겼거나 금액이 바뀐 경우에만 150~500ms 사이 무작위 지연 뒤 한 번 조회하고, 그 사이 신호는 합친다. 조회 결과로 목록을 맞춘다(서버에 없는 후보는 빠진다). Trades는 이 이벤트를 보내지 않는다. 거래 완료로 주문이 바뀌면 프론트가 `trade.updated`로 주문 GET을 다시 친다.

## API (`/v1`)

공통: 생성 시 헤더 `Idempotency-Key` **필수**.

| Method | Path | 설명 |
|---|---|---|
| POST | `/buy-orders` | 201 `BuyOrder` (status=`MATCHING`) |
| GET | `/buy-orders` | 내 구매 목록 |
| GET | `/buy-orders/:id` | 상세 |
| GET | `/buy-orders/:id/matching-status` | 복구/재진입 |
| GET | `/buy-orders/:id/candidates` | Exact/Near 후보 |
| POST | `/buy-orders/:id/match` | 판매자 선택 → Trade |
| POST | `/buy-orders/:id/cancel` | **MATCHING만** |
| POST | `/sell-orders` | 전액 lock |
| GET | `/sell-orders` | 내 판매 목록 |
| GET | `/sell-orders/:id` | Lot 할당 포함 |
| POST | `/sell-orders/:id/cancel` | **remaining만** unlock |
| GET | `/admin/orders` | 통합 목록 (근사 페이지) |
| GET | `/admin/buy-orders/:id`, `/admin/sell-orders/:id` | |

## 코드 패턴

- 참여 조건: `UserService.assertP2pEligibleInTransaction` (ACTIVE 유저 + ACTIVE 계좌).
- Sell: `CoinService.lockSellableInTransaction` → `sell_order_coin_lots`.  
  `original = remaining + reserved + completed + cancelled`. Cancel moves remaining into cancelled (unlock remaining only).
- Buy: Coin 없음. 상태 `MATCHING`. `matched_coin_amount` / `match_type`은 match 시 채움.
- 주문번호 `BO-YYYYMMDD-NNNNNN` (KST). 시퀀스 테이블을 TX 안에서 `FOR UPDATE`.
- Idempotency: `(userId, key)` unique. 같은 금액이면 기존 주문 반환, 다른 금액이면 `DUPLICATE_ORDER_REQUEST`.
- Sell 상태: `OPEN` / `PARTIALLY_MATCHED` / `FULLY_RESERVED` / `COMPLETED` / `CANCELLED`.
- 자기매칭은 P0-5에서 차단.
- 판매는 1인 1건. `OPEN`/`PARTIALLY_MATCHED`/`FULLY_RESERVED` 중 `remaining > 0` 이거나 `PENDING_SELLER` 요청이 있으면 활성으로 보고 새 Sell을 막는다. 지갑 행 잠금(`lockSellableInTransaction`) 뒤에 검사해 동시 등록을 직렬화한다.

Buy 취소: `MATCHING`만. 이미 `MATCHED`면 `ORDER_ALREADY_MATCHED` → Trade API로.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | 헤더 없음 |
| `INVALID_ORDER_AMOUNT` | 400 | 금액 |
| `SELL_ORDER_MINIMUM_TRADE_INVALID` | 400 | 최소거래 계산 실패 |
| `DUPLICATE_ORDER_REQUEST` | 409 | 같은 키, 다른 금액 |
| `BUY_ORDER_NOT_FOUND` / `SELL_ORDER_NOT_FOUND` | 404 | |
| `ORDER_NOT_CANCELLABLE` | 409 | remaining 0, COMPLETED 등 |
| `ORDER_ALREADY_MATCHED` | 409 | 매칭된 Buy 취소 |
| `ORDER_ALREADY_CANCELLED` | 409 | |
| `ACTIVE_SELL_ORDER_EXISTS` | 409 | 활성 Sell이 이미 있음 |
| `MATCHING_POLICY_NOT_FOUND` | 404 | 시드 정책 없음 |
| `USER_NOT_ACTIVE` / `ACTIVE_BANK_ACCOUNT_REQUIRED` | 409 | P2P 자격 |

## 주의

1. Buy 생성 응답은 주문만 반환한다. 후보 갱신은 `matching.changed` 뒤 candidates GET.
2. `GET /market/sell-orders`는 거래소 browse. Buy 후보와 역할이 다르다.
   `seller` 통계는 판매자 역할 거래만 센다.
   - `completedTradeCount`: `COMPLETED` (분쟁 강제 완료 포함)
   - `completionRatePct`: `completed / (completed + 판매자 귀책 취소)`. 판매자 귀책 취소 = `TRADE_CANCELLED` 이벤트의 `actor_type=SELLER`, `previous_status=WAITING_BUYER_PAYMENT`. 구매자 입금 전 취소·미입금 확정(`PAYMENT_TIMEOUT`→)·합의 취소·분쟁 강제 취소는 제외. **분모 0이면 null**
   - `disputeCount`: 판매자 귀책 분쟁, 철회 제외. `SELLER_NO_CONFIRM`·`SELLER_CONFIRMATION_TIMEOUT`(강제 취소 판정 제외) + 판매자가 연 `NOT_RECEIVED` 중 강제 완료 판정
   - `isNewSeller`: 종료 거래(완료+취소) 0건

   `GET /market/sellers/me`(JWT)는 같은 집계로 내 판매자 카드를 돌려준다. 판매 상세의 「구매자에게는 이렇게 보여요」 미리보기에서 사용한다.

   buyer 수락 요약(`loadBuyerSummary`)은 같은 방식으로 구매자 귀책 취소만 분모에 넣는다(`p0-5b-seller-accept.md`).
3. 활성 `matching_policies` 기본: 최소 분할 20%, Near ±10% (`near_match_max_ratio_bps=1000`), 입금 300s, 판매자 확인 180s.
