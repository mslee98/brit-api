# P0-5b 판매자 수락 매칭 (M1~M4 백엔드 코어 구현)

> **상태:** M0 정책 + **M1~M4 코드 구현** (Apply→Accept/Reject/Cancel/Expire).  
> **병행:** [p0-5-matching.md](./p0-5-matching.md)의 `POST /match`는 아직 유지. 전면 개편은 M10.  
> **전문(UX·TX·테스트):** [trade-seller-accept-flow.md](../../../brit-front/docs/porcess/trade-seller-accept-flow.md) **v0.3**  
> **작업 지시서:** [p0-5b-m1-m4-plan.md](./p0-5b-m1-m4-plan.md)

## 요약

```text
Apply → remaining↓ reserved↑ → TradeRequest PENDING_SELLER → Buy REQUEST_PENDING
Accept → (재차감 없음) Trade Binding → Buy MATCHED → 입금 TTL 시작
Reject|Expire|Cancel → release() → reserved↓ remaining↑ → Buy MATCHING
```

Push: 기존 `notification_events` / `notification_recipients` + 신규 `user_push_subscriptions` / `notification_outbox` — **M7 미구현 (TODO stub)**.  
신규 `notifications` 테이블 없음.

## API (코드)

| Method | Path | 비고 |
|--------|------|------|
| POST | `/buy-orders/:id/apply` | `Idempotency-Key` |
| POST | `/trade-requests/:id/accept` | 멱등: 기존 tradeId |
| POST | `/trade-requests/:id/reject` | `reasonCode` |
| POST | `/trade-requests/:id/cancel` | 구매자 |
| GET | `/trade-requests/:id` | JOIN으로 tradeId |
| GET | `/buy-orders/:id/candidates` | `MATCHING`만. `REQUEST_PENDING` → 409 |

## 스키마·런타임

- `trade_requests` + pending Buy/Sell partial unique  
- `trades.trade_request_id` NULL UNIQUE (기존 `/match` Trade 호환; Accept부터 채움)  
- `buy_order_status.REQUEST_PENDING`  
- `matching_policies.trade_request_timeout_seconds` (180)  
- Buy TTL Worker: **`MATCHING`만**. Request TTL: MatchingWorker → `expireTradeRequest`  
- release: [`TradeRequestReservationService`](../../src/modules/matching/trade-request-reservation.service.ts)

## 다음

**M5~M6 Front UX**, **M7 Push Outbox**. curl E2E 후 Front 착수.  
p0-5-matching 전면 개정·`/match` deprecate는 M10.
