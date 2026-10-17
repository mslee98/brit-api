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

실시간 신호는 [p0-4-orders.md](./p0-4-orders.md) `/orders`. 후보 폴링은 없다. `matching.changed`는 판매 잔량이 실제로 바뀐 뒤에만 보낸다. Request TTL 만료는 `EXPIRED`로 저장됐을 때만 발행하고, 이미 수락됐거나 아직 기한 전인 no-op은 보내지 않는다. 매칭 대기는 `buy-order:{id}`에 join하고, 진입 시 candidates GET을 한 번 친 뒤 `matching.changed`가 오면 짧게 모아 다시 한 번 친다. 신청 상태는 `trade-request.updated` 뒤 request GET.

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
2. 프론트는 진입 시 candidates GET 한 번, 이후 `matching.changed`만 다시 조회한다. 받은 후보는 바로 목록에 넣고, 새로 생긴 판매자만 이어서 보여 준다. 확인 시트는 행을 눌렀을 때만 연다. 2.5초 폴링과 1.5초 순차 공개는 쓰지 않는다.
3. auto_match fallback은 P0 제외.

## 다음 (제안 · M0 확정)

판매자 수락 후 Trade + 구매자 PWA Push: [p0-5b-seller-accept.md](./p0-5b-seller-accept.md),  
[trade-seller-accept-flow.md](../../../brit-front/docs/porcess/trade-seller-accept-flow.md) (v0.3 M0).

다음 구현: M1 `trade_requests` Migration + Apply TX.
