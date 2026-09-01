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

Buy 생성은 `MATCHING` 주문만 반환한다. 즉시 매칭하지 않는다.

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
| `MATCHING_POLICY_NOT_FOUND` | 404 | 시드 정책 없음 |
| `USER_NOT_ACTIVE` / `ACTIVE_BANK_ACCOUNT_REQUIRED` | 409 | P2P 자격 |

## 주의

1. Buy 생성 응답은 주문만 반환한다. 프론트는 candidates 폴링 후 match.
2. `GET /market/sell-orders`는 거래소 browse. Buy 후보와 역할이 다르다.
3. 활성 `matching_policies` 기본: 최소 분할 20%, Near ±10% (`near_match_max_ratio_bps=1000`), 입금 300s, 판매자 확인 180s.
