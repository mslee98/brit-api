# 알림 Inbox · Push (구현 메모)

모듈: [`src/modules/notifications/`](../../src/modules/notifications/). 화면·문구 정책은 [brit-front/docs/domains/notifications.md](../../../brit-front/docs/domains/notifications.md).

## 저장 모델

| 테이블 | 역할 |
|---|---|
| `notification_events` | 업무 사건 1건. `(event_type, reference_type, reference_id)` unique |
| `notification_recipients` | 수신자별 행. `(notification_event_id, recipient_user_id)` unique. 읽음·보관 상태 |
| `notification_outbox` | Web Push 발송 대기열 (worker가 재시도) |

- 양쪽 당사자에게 가는 알림(거래 완료·취소·만료, 분쟁 접수·종료)은 **사건 1건 + 수신자 2건**이다.
- 수신자 행의 `recipient_role`·`title`·`message`·`action_path`·`payload`는 역할별로 다르게 보여 줄 값이다. 비어 있으면 사건 값을 쓴다 (가입 알림 등 기존 행).
- `payload`는 발송 시점 스냅샷 `{ coinAmount, counterpartyNicknameMasked }`. **호출 도메인**(Trades·Matching)이 `EnqueueTradePushInput.snapshot`으로 넘긴다. 알림 모듈은 거래·회원 테이블을 직접 읽지 않는다.
- 상대방 닉네임 마스킹은 `UserService.getMaskedNicknameByUserId` ([`nickname-mask.util.ts`](../../src/modules/users/utils/nickname-mask.util.ts)).

## 발송 경로

`NotificationService.enqueueTradePushInTransaction` — 업무 TX 안 savepoint에서 `findOrCreateEvent → insertRecipient(SSE 발행) → insertOutbox`.

- 같은 수신자 재발송은 unique 위반으로 무시한다. 그 외 실패도 로그만 남기고 업무 커밋을 막지 않는다.
- Trades는 `enqueueTradePartyPushInTransaction`(양쪽) / `enqueueTradeRecipientPushInTransaction`(한쪽)만 쓴다.

## 처리 필요 (actionState)

읽음과 별개로, 연결된 업무의 **현재 상태**로 조회 시점에 판정한다 ([`notification-action-state.ts`](../../src/modules/notifications/domain/notification-action-state.ts)).

| 알림 | REQUIRED 조건 |
|---|---|
| `TRADE_REQUEST_CREATED` (판매자) | 요청이 `PENDING_SELLER`이고 만료 전 |
| `TRADE_PAYMENT_REPORTED` (판매자) | 거래가 `WAITING_SELLER_CONFIRMATION` |
| `TRADE_REQUEST_ACCEPTED` (구매자) | 거래가 `WAITING_BUYER_PAYMENT` |

위 종류인데 조건을 벗어나면 `DONE`, 나머지는 `NONE`.

> **타 도메인 테이블 읽기 예외**: `actionRequiredSql`은 `trades`·`trade_requests`를 `EXISTS`로 읽는다. 업무 상태가 바뀔 때마다 알림 행을 갱신하면 모든 상태 전이에 알림 의존이 생기므로, 읽기 전용 조건식으로 한정해 허용한다. 쓰기·Repository 주입은 하지 않는다.

## API (`/v1/me/notifications`)

| Method | Path | 설명 |
|---|---|---|
| GET | `/` | `SearchNotificationDto` — `page`, `size`, `filter`(`all`·`unread`·`action`) |
| GET | `/counts` | `{ unreadCount, actionRequiredCount }` — 헤더 배지·필터 칩 |
| GET | `/unread-count` | `{ count }` (기존 호환) |
| PATCH | `/read-all` · `/:id/read` · `/:id/archive` | 읽음·보관 |
| SSE | `/stream` | 새 수신 행 실시간 (`actionState`는 REQUIRED로 발행) |
