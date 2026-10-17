# P0-7 분쟁 (M1 + M2 + M3)

입금 신고 후 불일치·판매자 무응답을 `DISPUTED`로 올리고, CS가 `resolve`로만 원장·취소를 닫는다.  
**M1:** 진입 API + 판결 API. **M2:** 분쟁 큐·배정·어드민 인박스. **M3:** `trade_dispute_actions` 삼자 채팅(REST + Socket `/disputes`). 증빙·매크로는 M4.

정책 UX 전문: [brit-front/docs/porcess/trade-disputes.md](../../../brit-front/docs/porcess/trade-disputes.md).  
정상 Trade 진행: [p0-6-trade.md](./p0-6-trade.md).

## 상황 분류

| # | 실제 입금 | 구매자 report | 판매자 | Trade | CS? |
|---|---|---|---|---|---|
| 1 | 없음 | 없음 | 미입금 취소 | `WAITING_BUYER_PAYMENT` / `PAYMENT_TIMEOUT` → `CANCELLED` | 아니오 (`cancel` / `mark-unpaid`) |
| 2-1 | 없음 | 있음 | deny / 무응답 | → `DISPUTED` | 예 → 대개 `FORCE_CANCEL` |
| 2-2 | 있음 | 있음 | deny / 무응답 | → `DISPUTED` | 예 → 대개 `FORCE_COMPLETE` |
| — | — | 있음 | seller timeout | Worker → `DISPUTED` | 예 |

2-1과 2-2는 **상태만으로 구분 불가**. 삼자 채팅(M3)으로 확인하고, 증빙 첨부는 M4.

## 목표 (M1)

```text
WAITING_SELLER_CONFIRMATION
  ├ deny-payment (seller)     → DISPUTED + trade_disputes(NOT_RECEIVED)
  ├ POST .../disputes (buyer) → DISPUTED + trade_disputes(SELLER_NO_CONFIRM)
  └ seller timeout (worker)   → DISPUTED + trade_disputes(SELLER_CONFIRMATION_TIMEOUT)

DISPUTED
  ├ admin FORCE_COMPLETE → COIN_TRANSFERRING → COMPLETED (confirm 원장 재사용)
  ├ admin FORCE_CANCEL   → CANCELLED (예약 해제 재사용)
  └ admin RESUME         → WAITING_BUYER_PAYMENT (기한 연장, report 초기화)
```

원칙:

1. 돈·코인 변경은 `resolve`만. 채팅/UI 임의 조작 없음.
2. `DISPUTED`면 Worker timeout 대상이 아님(상태 필터만으로 정지).
3. Trade 1건당 dispute 1건 (`trade_disputes.trade_id` unique).
4. 1번(미입금·미신고)은 분쟁 큐에 넣지 않는다.

## 핵심 파일

| 역할 | 경로 |
|---|---|
| 사용자 HTTP | `src/modules/trades/trades.controller.ts` |
| 관리자 거래 HTTP | `admin-trades.controller.ts` |
| 관리자 분쟁 큐 | `admin-disputes.controller.ts` |
| 사용자 분쟁 채팅 | `disputes.controller.ts` |
| 도메인 | `trade.service.ts` |
| 분쟁 행 | `infrastructure/entities/trade-dispute.entity.ts` |
| 채팅·메모 | `infrastructure/entities/trade-dispute-action.entity.ts` |
| reasonCode | `domain/enums/trade-dispute-reason-code.enum.ts` |
| resolution | `domain/enums/trade-dispute-resolution.enum.ts` |
| 예외 | `exceptions/trade.exceptions.ts` |

## Enum

### reasonCode (`TradeDisputeReasonCode`)

| 값 | 언제 |
|---|---|
| `NOT_RECEIVED` | 판매자 deny-payment |
| `SELLER_NO_CONFIRM` | 구매자 open dispute |
| `SELLER_CONFIRMATION_TIMEOUT` | Worker |
| `FALSE_REPORT` | (예약) |
| `WRONG_AMOUNT` | 관리자 open 등 |
| `WRONG_ACCOUNT` | 관리자 open 등 |
| `ADMIN_OPENED` | 관리자 수동 접수 |

### resolution (`TradeDisputeResolution`)

| 값 | Trade 결과 | Coin |
|---|---|---|
| `FORCE_COMPLETE` | `COMPLETED` | confirm과 동일 이전 |
| `FORCE_CANCEL` | `CANCELLED` | 예약 해제 |
| `RESUME` | `WAITING_BUYER_PAYMENT` | 유지, dueAt 연장, reportedPaid null |

`FORCE_REVERSAL`(완료 후 역분개)는 P0 제외.

## API (`/v1`)

### 사용자

| Method | Path | 주체 |
|---|---|---|
| POST | `/trades/:id/deny-payment` | 판매자. `WAITING_SELLER_CONFIRMATION`만 |
| POST | `/trades/:id/disputes` | 구매자. 동일 상태. body optional `{ reason? }` |

이미 `DISPUTED`면 멱등 상세 반환. 다른 상태면 `TRADE_INVALID_STATUS`.  
`actions.canDenyPayment` / `canOpenDispute`는 해당 역할·상태에서만 true. `DISPUTED`에서는 입금·확인·취소 CTA 전부 false.  
`GET /trades` 목록과 `GET /trades/:id`에 `dispute: { id, status, canChat } | null`. `canChat`은 열린 분쟁(`OPEN_UNASSIGNED`·`ASSIGNED`·`IN_REVIEW`·`EVIDENCE_REQUIRED`).  
`DISPUTE_OPENED` 푸시 deepLink는 `/trade/dispute/:disputeId` (앱 `DisputeChat`).

### 사용자 — 채팅 (M3)

| Method | Path | 주체 |
|---|---|---|
| GET | `/disputes/:id` | 당사자. `{ id, tradeId, status, canChat, displayName }` (`displayName`은 항상 `Brit 분쟁조정팀`) |
| GET | `/disputes/:id/messages` | 당사자. `{ items, pagination }`, `is_internal` 숨김, `createdAt ASC` |
| POST | `/disputes/:id/messages` | 당사자. `{ body }` 1~2000자. 201. 종료된 방 `409 TRADE_DISPUTE_CLOSED` |

담당자 실명·`actorUserId`·내부메모는 사용자 응답에 없음. 배정 전에도 당사자는 쓸 수 있다.

### 관리자 — 판결 (M1)

| Method | Path | 권한 |
|---|---|---|
| POST | `/admin/trades/:id/open-dispute` | ADMIN+. reasonCode + reason |
| POST | `/admin/trades/:id/resolve-dispute` | 리더/SYS_ADMIN. `{ resolution, reason }` |

`resolve`는 Trade `FOR UPDATE` + dispute open 행 필수. 감사 `ADMIN_RESOLVE_TRADE_DISPUTE`. 푸시 `DISPUTE_RESOLVED`.

### 관리자 — 워크벤치 (M2)

| Method | Path | 권한 |
|---|---|---|
| GET | `/admin/disputes` | ADMIN+. 큐. status/reasonCode/priority/assignee(`me`\|`unassigned`\|uuid)/keyword/`partyUserId`(구매자·판매자 OR) |
| GET | `/admin/disputes/:id` | ADMIN+. 진단 상세(금액·계좌·이벤트·배정) |
| POST | `/admin/disputes/:id/assign` | ADMIN+ 본인 수령. 타인 지정은 리더/SYS_ADMIN `{ adminUserId? }` |
| POST | `/admin/disputes/:id/takeover` | 리더/SYS_ADMIN. 담당자 교체 |

`status` 생략 시 열린 건만 (`OPEN_UNASSIGNED` \| `ASSIGNED` \| `IN_REVIEW` \| `EVIDENCE_REQUIRED`).  
`partyUserId`는 인박스 Inspector 이력용. 큐 기본 필터(status 생략=open, assignee)는 그대로다. 목록 항목에 `resolution` / `resolvedAt`을 포함한다.  
assign: `OPEN_UNASSIGNED` → `ASSIGNED`. 이미 배정이면 `409 DISPUTE_ALREADY_ASSIGNED`.  
takeover: 열린 건이면 담당자 교체. 같은 담당자면 멱등 200.  
감사 `ADMIN_ASSIGN_TRADE_DISPUTE`. 이벤트 `DISPUTE_ASSIGNED`.  
판결 엔드포인트는 만들지 않음. 인박스가 기존 `resolve-dispute`를 호출.

### 관리자 — 채팅 (M3)

| Method | Path | 권한 |
|---|---|---|
| GET | `/admin/disputes/:id/messages` | ADMIN+. 내부 메모 포함 |
| POST | `/admin/disputes/:id/messages` | ADMIN+. `{ body, isInternal? }` |

공개 메시지는 배정된 건만. 미배정이면 `409 TRADE_DISPUTE_NOT_ASSIGNED`. 내부 메모는 열린 건이면 미배정도 가능. 첫 공개 관리자 메시지 때 `ASSIGNED` → `IN_REVIEW`.  
테이블은 ERD `trade_dispute_actions`. `action_type`: `MESSAGE` \| `INTERNAL_NOTE`. 배정/판결은 `trade_events`만 (이중 기록 없음).  
시스템 `MESSAGE`(actor null): assign/takeover 「상담원이 합류했어요.」, resolve 「검토가 끝났어요. 더 이상 메시지를 보낼 수 없어요.」  
실시간은 Socket.IO (`/disputes`). REST는 쓰기·히스토리. 폴링 없음.

어드민 Inbox(`/inbox`) 가운데 pane은 채팅. 진단 헤더·resolve CTA 유지.

## 코드 패턴

진입(deny/open/timeout): Trade lock → status `DISPUTED` → `trade_disputes` insert → events → push.

`FORCE_COMPLETE`:

1. TX A: `DISPUTED` → `COIN_TRANSFERRING` (또는 confirm 경로와 동일하게 전이)
2. TX B: 기존 `transferTradeCoin` 재사용. dispute `RESOLVED` + `FORCE_COMPLETE`.

`FORCE_CANCEL`: 기존 취소/mark-unpaid 예약 해제 경로 재사용 + dispute resolve.

`RESUME`: `WAITING_BUYER_PAYMENT`, `buyerReportedPaidAt=null`, `sellerConfirmationDueAt=null`, `buyerPaymentDueAt=now+timeout`, dispute resolve.

## 예외

| code | HTTP | 언제 |
|---|---|---|
| `TRADE_DISPUTE_ALREADY_EXISTS` | 409 | 분쟁 행 충돌 |
| `TRADE_ONLY_SELLER_CAN_DENY_PAYMENT` | 403 | |
| `TRADE_ONLY_BUYER_CAN_OPEN_DISPUTE` | 403 | |
| `TRADE_DISPUTE_NOT_FOUND` | 404 | resolve 시 open dispute 없음 |
| `TRADE_DISPUTE_ALREADY_RESOLVED` | 409 | |
| `DISPUTE_ALREADY_ASSIGNED` | 409 | 미배정이 아닌 건에 assign |
| `TRADE_DISPUTE_CLOSED` | 409 | 종료된 방에 메시지 |
| `TRADE_DISPUTE_NOT_ASSIGNED` | 409 | 미배정 건에 관리자 공개 메시지 |
| `TRADE_INVALID_STATUS` | 409 | 허용되지 않은 전이 |

## 주의

1. 판매자 「못 받았어요」는 **서버 deny-payment**다. 프론트 로컬 `DISPUTED` 위조 금지.
2. 입금 **전** 「돈을 못 받았어요」는 `cancel`/`mark-unpaid` (분쟁 아님).
3. confirm 200이 `COMPLETED`를 보장하지 않듯, `FORCE_COMPLETE`도 Worker recovery를 탈 수 있다.
4. `DISPUTED` 중에는 사용자 confirm/cancel/report 금지.
5. 채팅은 소통만. 원장 변경은 `resolve`만. 증빙·매크로는 M4.

## 후속 로드맵

### M2 — Dispute Workbench

완료. `GET /v1/admin/disputes`, assign/takeover, 인박스 실 API.

### M3 — 삼자 채팅 (REST + Socket)

완료. `trade_dispute_actions`, 사용자/관리자 messages REST, 앱 `DisputeChat` Activity, 인박스 채팅 pane. 실시간: Socket.IO namespace `/disputes` (`dispute.message.created` / opened / updated / resolved). 쓰기는 REST 유지.

### M4 — 예방·증빙

- `withdraw-payment-report` — 구매자, `WAITING_SELLER_CONFIRMATION`, 신고 후 10분·판매자 미확인. 철회 후 `WAITING_BUYER_PAYMENT` + 입금 기한 재설정. 이벤트 `BUYER_WITHDREW_PAYMENT_REPORT`.
- 이미지 증빙 — `POST …/evidence` (multipart), `action_type=EVIDENCE`, 로컬 `assets/disputes/{id}/`.
- CS 매크로 — `GET /admin/disputes/macros` 정적 시드.
- (제외) `FORCE_REVERSAL`, 은행 OCR

사용자·관리자 **화면 갭**(채팅 자동 입장·복귀·드롭·미배정 강조): [trade-disputes.md §9](../../../brit-front/docs/porcess/trade-disputes.md). API 완료와 UX 완료를 구분한다.
