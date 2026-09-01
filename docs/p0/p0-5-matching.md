# P0-5 Matching (Browse+Select)

구매자가 판매 후보를 보고 선택한다. Worker는 Trade를 만들지 않고 MATCHING TTL만 만료한다.

## 목표

```text
BuyOrder MATCHING
  → GET candidates (Exact / Near Projection)
  → POST match (sellOrderId + expected*)
    → Buy/Sell FOR UPDATE
    → remaining↓ reserved↑
    → Trade WAITING_BUYER_PAYMENT
    → BuyOrder MATCHED + matched_coin_amount + match_type
```

## 정책

- **Exact**: `sell.remaining == buy.coin_amount`
- **Near (금액 변경형)**: remaining ≠ buy 이지만 `|diff|/buy ≤ near_match_max_ratio_bps`. Trade 금액 = **sell remaining 전액**. 구매 분할 없음.
- Candidate 테이블 없음. `matching_attempts`는 선택 결과 이력.
- 자동 rematch / SKIP LOCKED 자동 체결 **없음**.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| 매칭 TX / 후보 | `src/modules/matching/matching.service.ts` |
| Worker | `matching.worker.ts` (`@Interval(2000)` TTL EXPIRED) |
| 상수 | `domain/constants/matching.constants.ts` (`BUY_MATCHING_TIMEOUT_SECONDS=900`) |
| Trade 생성 | `trade.service.ts` `createMatchedTradeInTransaction` |
| 예외 | `matching/exceptions/matching.exceptions.ts` |

## API

| Method | Path | 설명 |
|---|---|---|
| GET | `/buy-orders/:id/candidates?type=EXACT\|NEAR&limit&cursor` | 후보 |
| POST | `/buy-orders/:id/match` | `{ sellOrderId, expectedMatchType, expectedCoinAmount }` |
| GET | `/buy-orders/:id/matching-status` | status + optional `candidateSummary` |

정렬:

- Exact: `completed_trade_count DESC`, `created_at ASC`, `id ASC`
- Near: `abs(diff) ASC`, 그다음 Exact와 동일

필터: OPEN/PARTIALLY_MATCHED, remaining>0, seller≠buyer, 판매자 ACTIVE + ACTIVE 계좌.

## match TX

1. Buy `pessimistic_write` — `MATCHING`, TTL 미만료
2. Sell `pessimistic_write` — SKIP LOCKED 없음. 불가면 `SELL_ORDER_UNAVAILABLE`
3. 서버 재계산 vs expected → 불일치 `CANDIDATE_CHANGED`
4. Trade + MatchingAttempt MATCHED + Buy MATCHED

## Worker

`MATCHING AND created_at + 900s <= now` → `EXPIRED`. Trade 생성 금지.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `MATCHING_BUY_ORDER_NOT_MATCHABLE` | 409 | MATCHING 아님 / TTL 만료 |
| `MATCHING_ALREADY_MATCHED` | 409 | 이미 MATCHED |
| `SELL_ORDER_UNAVAILABLE` | 409 | Sell 선점/불가 |
| `CANDIDATE_CHANGED` | 409 | expected 불일치 |
| `MATCHING_SELL_ORDER_CHANGED` | 409 | lot 할당 실패 등 |
| `BUY_ORDER_NOT_FOUND` | 404 | |
| `MATCHING_POLICY_NOT_FOUND` | 404 | |
| `INVALID_CANDIDATE_CURSOR` | 409 | |

## 주의

1. Market API와 candidates를 합치지 말 것.
2. 프론트는 candidates 2.5s 폴링 + match. Socket/SSE 불필요 (P0).
3. auto_match fallback은 P0 제외.

## 다음 (제안 · M0 확정)

판매자 수락 후 Trade + 구매자 PWA Push: [p0-5b-seller-accept.md](./p0-5b-seller-accept.md),  
[trade-seller-accept-flow.md](../../../brit-front/docs/porcess/trade-seller-accept-flow.md) (v0.3 M0).

다음 구현: M1 `trade_requests` Migration + Apply TX.
