# P0-5b M1~M4 구현 계획 (백엔드 뼈대)

> **상태:** M1~M4 완료 (백엔드 코어 Done). Push·Front는 M5+.  
> **정책 SoT (M0):** [trade-seller-accept-flow.md](../../../brit-front/docs/porcess/trade-seller-accept-flow.md)  
> **요약 메모:** [p0-5b-seller-accept.md](./p0-5b-seller-accept.md)  
> **현재 코드:** Apply→Accept/Reject/Cancel/Expire + release 단일화. `POST /match` 병행.

문서 마일스톤 기준으로 **M1→M2→M3→M4**가 한 덩어리의 백엔드 뼈대다.  
**(M4만 단독으로 하면 release/Expire를 걸 대상 TX가 없음.)**

---

## 목표 한 줄

> DB·API만으로 `Apply → (Accept|Reject|Cancel|Expire)` 가 문서 Reservation/TTL 규칙대로 동작하고, race에서도 Trade/Request가 정확히 1경로로 끝나게 한다.  
> **Push·Front·로켓은 M5 이후.**

```text
M1 스키마
 → M2 Apply (선점)
 → M3 Accept/Reject/Cancel (Binding·해제)
 → M4 release 공통화 + Expire Worker + Buy TTL 분리
```

---

## M1 — Migration / Entity

### 목적

코드가 올라갈 자리를 만든다. 비즈니스 API는 아직 없어도 됨.

### 작업 목록

| # | 작업 | 상세 |
|---|------|------|
| 1 | enum | `buy_order_status`에 `REQUEST_PENDING` ADD VALUE |
| 2 | enum | `trade_request_status`: `PENDING_SELLER\|ACCEPTED\|REJECTED\|EXPIRED\|CANCELLED_BY_BUYER` |
| 3 | enum | `buy_match_type`는 이미 있음 → Request에도 재사용 |
| 4 | enum (선택) | `trade_request_rejection_reason`: `NOT_AVAILABLE_NOW\|AMOUNT_NOT_PREFERRED\|OTHER` |
| 5 | 테이블 `trade_requests` | 문서 §9 컬럼 + FK buy/sell/buyer/seller |
| 6 | partial unique | `(buy_order_id) WHERE PENDING_SELLER`, `(sell_order_id) WHERE PENDING_SELLER` |
| 7 | idempotency | `(buyer_user_id, idempotency_key)` unique WHERE key IS NOT NULL |
| 8 | `trades.trade_request_id` | `uuid NULL UNIQUE` + FK (기존 Trade는 NULL 허용, Accept부터 채움) |
| 9 | `matching_policies.trade_request_timeout_seconds` | NOT NULL DEFAULT 180 |
| 10 | Entity/Enum TS | `TradeRequestEntity`, status enum, BuyOrderStatus 갱신, TradeEntity 컬럼 |

### 파일 위치 (예상)

```text
brit-api/src/database/migrations/1753350…-AddTradeRequests.ts
brit-api/src/modules/matching/infrastructure/entities/trade-request.entity.ts
brit-api/src/modules/matching/domain/enums/trade-request-status.enum.ts
brit-api/src/modules/orders/domain/enums/buy-order-status.enum.ts  (수정)
brit-api/src/modules/trades/infrastructure/entities/trade.entity.ts (수정)
brit-api/src/modules/orders/infrastructure/entities/matching-policy.entity.ts (수정)
```

모듈: Matching에 Entity 등록 (Orders 순환 피하려고 Matching이 Buy/Sell 직접 쓰는 기존 패턴 유지).

### 완료 기준

- `migration:run` 성공 (로컬은 이력이 어긋날 수 있음 → 스키마 확인 후 fake/실행)
- TypeORM Entity로 insert/select 스모크 가능
- **API 동작은 M2 범위**

### M1에서 하지 말 것

Push 테이블, `/match` 삭제, Front, Outbox.

---

## M2 — Apply TX

### 목적

문서 §12: Candidate 선택 → **물량 선점 + REQUEST_PENDING**. Trade 없음.

### API

```http
POST /v1/buy-orders/:buyOrderId/apply
Authorization: Bearer
Idempotency-Key: required
```

Controller: [`buy-order.controller.ts`](../../src/modules/orders/buy-order.controller.ts)  
Service: `MatchingService.applyToSellOrder` (또는 `TradeRequestService.apply`) — **기존 `selectMatch`/`match`와 분리**.

### TX 순서 (그대로 구현)

```text
BEGIN
1. Buy FOR UPDATE — buyer, MATCHING, Buy TTL 미만료
2. Idempotency: 같은 key면 기존 PENDING/동일 요청 반환
3. PENDING Request 존재 → BUY_ORDER_PENDING_REQUEST (idempotency 없을 때)
4. Sell FOR UPDATE — OPEN/PARTIALLY_MATCHED, remaining>0, seller≠buyer, PENDING 없음
5. computeMatch(buy, remaining, near_bps) vs expected → CANDIDATE_CHANGED
6. INSERT trade_requests (PENDING_SELLER, snapshot, expires_at=now+policy)
7. Sell remaining↓ reserved↑  (금액 = snapshot)
8. Sell status deriveSellOrderStatus
9. Buy → REQUEST_PENDING
COMMIT
```

알림/Outbox: **M2에서는 stub 또는 TODO** (M7).

### 부가 API (M2에 같이 넣으면 FE·테스트 편함)

| API | 동작 |
|-----|------|
| `GET /trade-requests/:id` | 당사자만, JOIN tradeId (아직은 null) |
| `GET .../candidates` | Buy가 `REQUEST_PENDING`이면 `409 BUY_ORDER_REQUEST_PENDING` |
| `matching-status` | `tradeRequest: { id, status, expiresAt }` 확장 |

### 테스트 (M2 Done)

| 케이스 | 기대 |
|--------|------|
| Exact Apply | Request 1, remaining/reserved 반영, Buy REQUEST_PENDING |
| Near Apply | snapshot = sell remaining |
| expected 불일치 | CANDIDATE_CHANGED, Sell 금액 불변 |
| 같은 Buy 두 번 Apply | 2번째 409 또는 idempotency면 동일 id |
| 같은 Sell 두 Buyer | PENDING 1 + SELL_ORDER_PENDING_REQUEST |
| Idempotency 더블탭 | 동일 tradeRequestId |
| candidates while REQUEST_PENDING | 409 |

### M2에서 하지 말 것

Accept, `/match` 제거(병행 유지 가능), Push.

---

## M3 — Accept / Reject / Cancel

### 목적

§13~15: Accept = Binding(재차감 없음). Reject/Cancel = release + Buy MATCHING.

### API

```http
POST /v1/trade-requests/:id/accept   # 판매자
POST /v1/trade-requests/:id/reject   # 판매자 { reasonCode }
POST /v1/trade-requests/:id/cancel   # 구매자
```

### Accept TX

```text
BEGIN
1. Request FOR UPDATE — PENDING_SELLER, seller, expires_at > now
   이미 ACCEPTED → 기존 Trade 찾아 200 (멱등)
2. Buy FOR UPDATE — REQUEST_PENDING, 동일 buy
3. Sell FOR UPDATE — reservation 정합
   깨짐 → REQUEST_STALE
4. ※ remaining/reserved 변경 금지
5. createMatchedTradeInTransaction (기존) + lot FIFO
   - coinAmount = request.requested_coin_amount
   - trade_request_id = request.id
   - buyer_payment_due_at = now + policy  ※ Accept 시각
6. Buy MATCHED + matched_* = snapshot
7. Request ACCEPTED + accepted_at
COMMIT
```

기존 [`selectMatch`](../../src/modules/matching/matching.service.ts)의 Trade 생성 조각을 **재사용**하고, Sell 차감 루프만 제거.

### Reject / Cancel TX

```text
Request FOR UPDATE PENDING_SELLER
→ REJECTED | CANCELLED_BY_BUYER
→ release()  // M4에서 추출하기 전엔 private으로 동일 로직 복붙 OK, M4에서 통합
→ Buy REQUEST_PENDING → MATCHING
```

### 테스트 (M3 Done)

| 케이스 | 기대 |
|--------|------|
| Accept | Trade 1, Sell remaining/reserved **불변**, Buy MATCHED |
| Accept 멱등 | Trade 1 |
| Reject | reserved↓ remaining↑, Buy MATCHING, candidates 다시 가능 |
| Cancel | 동일 unlock |
| EXPIRED 후 Accept | TRADE_REQUEST_EXPIRED |
| REQUEST_STALE | Trade 없음 (fixture로 reservation 깨뜨려 테스트) |

### M3 주의

- `POST /match`는 아직 두어도 됨. 새 플로우는 apply/accept만 타게.
- Push는 still stub.

---

## M4 — `release()` + Expire Worker + Buy TTL 분리

### 목적

§6·§7·§14: 해제 로직 단일화, Request TTL, Buy TTL이 REQUEST_PENDING을 죽이지 않음.

### 4.1 `TradeRequestReservationService.release`

```text
입력: manager, tradeRequestId (또는 entity)
전제: Request 이미 종료 상태로 바뀐 뒤 호출하거나, 안에서 PENDING→종료까지 묶을지 정책 통일

동작 (Idempotent):
- Sell FOR UPDATE
- reserved -= amount, remaining += amount (snapshot 금액)
- deriveSellOrderStatus
- Buy가 REQUEST_PENDING이면 → MATCHING
- 이미 release된 Request면 no-op
```

Reject / Cancel / Expire **전부 이 함수만** 호출.

### 4.2 Expire Worker

기존 [`MatchingWorker`](../../src/modules/matching/matching.worker.ts) 확장 또는 `TradeRequestExpiryWorker`:

```text
SELECT id FROM trade_requests
WHERE status = PENDING_SELLER AND expires_at <= NOW()
ORDER BY expires_at LIMIT N

각 건:
  TX: FOR UPDATE → 아직 PENDING이면 EXPIRED + release()
```

Accept와 동시: `FOR UPDATE`로 한쪽만 성공 (§14).

### 4.3 Buy TTL Worker 수정

현재 `expireBuyOrder` / `findExpiredMatchingBuyOrderIds`:

```text
WHERE status = MATCHING   ※ 이미 MATCHING만이면 OK
AND created_at + 900s <= now
```

확인·강제:

- `REQUEST_PENDING` **절대** Buy EXPIRED로 가지 않음
- 만료 시각은 `created_at + 900` 고정 (연장 없음)

### 테스트 (M4 Done = 백엔드 코어 Done)

| 케이스 | 기대 |
|--------|------|
| 180초 후 Worker | EXPIRED + release + Buy MATCHING |
| Accept vs Expire 동시 | ACCEPTED+Trade **또는** EXPIRED, 배타 |
| Cancel vs Accept | 배타 |
| REQUEST_PENDING 중 Buy TTL tick | Buy 상태 유지 |
| Reject 후 release 두 번 | reserved 한 번만 복구 |
| release Idempotent | 금액 합 보존 `original = rem+res+comp` |

---

## 스케줄·PR 쪼개기 제안

| PR | 내용 | 머지 조건 |
|----|------|-----------|
| **PR1 = M1** | Migration + Entity | migrate OK |
| **PR2 = M2** | apply + GET request + candidates 가드 | 단위 테스트 Apply |
| **PR3 = M3** | accept/reject/cancel | Accept 재차감 없음 테스트 |
| **PR4 = M4** | release + Expire worker + Buy TTL 점검 | race 테스트 |

한 PR에 M1~M4를 넣어도 되지만, **테스트 실패 시 롤백 단위**는 위가 안전하다.

---

## 의존 관계

```text
        M1 Schema
            │
            ▼
        M2 Apply ──────────────┐
            │                  │
            ▼                  │
        M3 Accept/Reject/Cancel│
            │                  │
            ▼                  │
        M4 release + Expire ◄──┘
            │
            ▼
     curl E2E 가능 → M5/M6 Front
```

---

## M1~M4 끝난 뒤 손으로 검증할 시나리오

1. 판매자 Sell 500k 생성  
2. 구매자 Buy 500k → Apply → Request PENDING, Sell reserved=500k  
3. 판매자 Accept → Trade `WAITING_BUYER_PAYMENT`, reserved 그대로  
4. (다른 브라우저) Apply 동시 → 409  
5. Reject 경로 / Worker expire 경로 각각 한 번씩  
6. Accept 직후 candidates → Buy MATCHED라 409/불가  

Push·SellOrderDetail UI는 **이 검증 통과 후** M5~.

---

## 요약 — “끝”의 정의

| Milestone | “끝”의 정의 |
|-----------|-------------|
| **M1** | DB/Entity에 Request·REQUEST_PENDING·timeout·trade_request_id |
| **M2** | Apply로 선점·Buy REQUEST_PENDING·idempotency·candidates 차단 |
| **M3** | Accept Binding(무재차감)·Reject/Cancel·Accept 멱등 |
| **M4** | release 단일화·Request Expire·Buy TTL은 MATCHING만 |

이 순서로 가면 문서 M0 규칙이 코드에 고정되고, 그다음 UX(M5~6)·Push(M7)는 API에 얹기만 하면 된다.

---

## Agent 작업 규칙 (구현 중)

1. **순서 고정:** M1 → M2 → M3 → M4. 앞 마일스톤 완료 기준 없이 다음으로 넘어가지 않는다.
2. **정책 충돌 시:** [trade-seller-accept-flow.md](../../../brit-front/docs/porcess/trade-seller-accept-flow.md) M0를 우선한다. TX 순서·상태 전이는 본 계획의 표를 그대로 따른다.
3. **범위 밖:** Push·Front·로켓·`/match` 삭제·Outbox는 M5+ (본 문서 M1~M4에서 하지 말 것).
4. **패턴:** `docs/p0/README.md` + 기존 Matching/Orders Entity·Exception·TX lock 패턴을 따른다. 새 계층(use-case 등) 금지.
5. **완료 후:** 본 계획의 Done 체크를 충족하면 [p0-5b-seller-accept.md](./p0-5b-seller-accept.md)를 “현재 구현 기준”으로 격상하고 [p0-5-matching.md](./p0-5-matching.md)를 개정한다.
