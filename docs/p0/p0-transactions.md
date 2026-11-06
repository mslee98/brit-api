# 사용자 통합 거래내역

사용자 거래내역 탭이 쓰는 조회 전용 API. 코드: `src/modules/transactions/`.

## 왜 원장이 아니라 원본 테이블을 합치나

`coin_ledger_entries`에는 끝난 Coin 이동만 남는다. 진행 중·취소된 P2P 거래, 처리 중인 업체 전환은 원장에 없다.
그래서 시작된 곳(원본 테이블)을 `UNION ALL`로 합친다. 관리자 조정만 원장에서 읽는다.

| 원본 | `kind` | 방향 | `id` 접두어 |
|------|--------|------|-------------|
| `trades` (구매자) | `P2P_BUY` | IN | `trade-` |
| `trades` (판매자) | `P2P_SELL` | OUT | `trade-` |
| `coin_purchases` | `BRIT_PURCHASE` | IN | `purchase-` |
| `partner_exchanges` CHARGE | `PARTNER_CHARGE` | OUT | `exchange-` |
| `partner_exchanges` REDEEM | `PARTNER_REDEEM` | IN | `exchange-` |
| `coin_ledger_entries` `ADMIN_CREDIT`/`ADMIN_DEBIT` | `ADMIN_ADJUSTMENT` | 부호로 판정 | `adjust-` |

**모듈 경계 예외:** `TransactionsModule`은 Trades·Coins·Partners 서비스를 거치지 않고 위 테이블을 SQL로 직접 읽는다. 쓰기는 하지 않는다. 원본 테이블의 상태 값이나 시각 컬럼이 바뀌면 `domain/transaction-history.query.ts`도 같이 고친다.

## 상태

| 화면 `status` | trades | coin_purchases | partner_exchanges |
|---------------|--------|----------------|-------------------|
| `PROCESSING` | 입금 대기·판매자 확인 대기·Coin 이동 중 | PENDING | REQUESTED·ASSET_LOCKED·PARTNER_PROCESSING |
| `CHECKING` | DISPUTED | — | RECONCILIATION_REQUIRED |
| `COMPLETED` | COMPLETED | COMPLETED | COMPLETED |
| `CANCELLED` | CANCELLED·PAYMENT_TIMEOUT | CANCELLED | — |
| `FAILED` | — | — | FAILED_CONFIRMED |

필터 `status=PROCESSING`은 `CHECKING`을 포함한다.

## 날짜 기준 (`occurredAt`)

끝난 시각(완료·취소·실패). 진행 중이면 시작 시각. 결정 2026-11-07.

- 정렬·날짜별 묶음·월 집계가 모두 이 값을 쓴다. KST(`Asia/Seoul`)로 자른다.
- 진행 중이던 건은 끝나는 순간 끝난 날짜로 옮겨 간다. 월말 자정을 넘겨 끝나면 다음 달 내역이 된다.
- 계산 컬럼이라 인덱스를 직접 타지 않는다. 각 원본을 사용자 id 인덱스로 먼저 좁힌다 (`ix_trades_buyer_created`·`ix_trades_seller_created`·`ix_coin_purchases_user_status`·`ix_partner_exchanges_user_requested`·`ix_coin_ledger_entries_user_created`). 사용자당 건수가 커지면 `created_at` 상한을 원본 쪽 조건에 추가한다.

## API

모두 `JwtAuthGuard`. 금액은 string bigint.

### `GET /v1/me/transactions`

| 쿼리 | 설명 |
|------|------|
| `month` | `YYYY-MM`. 없으면 기간 제한 없이 최신순 |
| `date` | `YYYY-MM-DD`. `month`보다 우선 |
| `type` | `ALL`·`BUY`(P2P 구매 + Brit 구매)·`SELL`·`CHARGE`·`REDEEM`·`ADJUSTMENT` |
| `status` | 쉼표 구분 `COMPLETED,PROCESSING,CANCELLED,FAILED` |
| `cursor` | 이전 응답의 `nextCursor` |
| `size` | 기본 30, 최대 100 |

응답 `{ items, nextCursor }`. 커서는 `(occurredAt, id)` 내림차순 keyset이다. 깨진 커서는 400 `TRANSACTION_INVALID_CURSOR`.

항목: `id, kind, direction, status, coinAmount, cashAmount, pointAmount, occurredAt, requestedAt, completedAt, referenceNumber, tradeId, counterpartyNickname(마스킹), partnerName, assetName`.

### `GET /v1/me/transactions/summary?month=YYYY-MM`

`type`·`status`도 받는다. 응답 `{ month, inflow, outflow, net, count, openCount, byKind, byDay[] }`.

- Coin 합계(`inflow`·`outflow`·`net`·`byKind`)는 완료 건만 센다.
- `count`는 모든 상태, `openCount`는 처리 중·확인 중 건수.
- `byDay[]`: `{ date, inflow, outflow, net, count, hasOpen }`. 건이 있는 날만.

### `GET /v1/me/transactions/:id`

목록 항목 + `bankName`, `accountNumberMasked`(P2P 판매자 입금 계좌), `exchangeRate`(업체 전환 비율), `timeline[]`.
`timeline` 단계: `REQUESTED` → `PAYMENT_REPORTED` → `CONFIRMED` → `COMPLETED`, 또는 끝에 `CANCELLED`·`FAILED`. 조정은 `COMPLETED` 하나.
다른 사용자의 id나 형식이 틀린 id는 404 `TRANSACTION_NOT_FOUND`.

## 주의

1. 업체 전환 `pointAmount`는 현재 `amount`와 같다. P0 자산은 모두 1:1이다. 비율이 1:1이 아닌 자산이 생기면 전환 시점 포인트 수량을 `partner_exchanges`에 저장해야 한다.
2. `coin_purchases`에는 번호 컬럼이 없어 `referenceNumber`가 null이다.
3. `PAYMENT_TIMEOUT` 거래는 `cancelled_at`이 비어 있으면 시작 시각에 남는다.
4. 판매 등록 lock(`SELL_ORDER_LOCKED`)은 내역에 넣지 않는다. Coin이 지갑을 떠난 게 아니라 묶인 것이라 지갑 화면에서 보여 준다.
5. 기존 `GET /v1/coins/history`는 원장 조회용으로 그대로 둔다.
