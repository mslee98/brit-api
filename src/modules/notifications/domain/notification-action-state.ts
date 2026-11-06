import { TradeRequestStatus } from '../../matching/domain/enums/trade-request-status.enum';
import { TradeStatus } from '../../trades/domain/enums/trade-status.enum';
import { NotificationActionState } from './enums/notification-action-state.enum';
import { NotificationEventType } from './enums/notification-event-type.enum';

/** 수신자 행동이 필요한 알림 종류 (각각 한쪽 역할에게만 발송된다) */
export const ACTIONABLE_NOTIFICATION_TYPES: ReadonlySet<NotificationEventType> =
  new Set([
    NotificationEventType.TRADE_REQUEST_CREATED,
    NotificationEventType.TRADE_PAYMENT_REPORTED,
    NotificationEventType.TRADE_REQUEST_ACCEPTED,
  ]);

/**
 * 알림 사건 alias(`e`) 기준 「지금 처리 필요」 SQL 조건.
 * 업무 상태가 바뀔 때마다 알림 행을 갱신하지 않도록 조회 시점에 거래·요청 상태를 읽는다
 * (타 도메인 테이블 읽기 예외 — docs/p0/p0-notifications.md).
 * 값은 enum 상수만 인라인하므로 사용자 입력이 섞이지 않는다.
 * - 구매 요청 도착(판매자): 요청이 아직 판매자 응답 대기이고 만료 전
 * - 입금 확인 필요(판매자): 거래가 아직 판매자 확인 대기
 * - 거래 성사(구매자): 거래가 아직 입금 대기
 */
export function actionRequiredSql(alias: string): string {
  return `(
    (${alias}.event_type = '${NotificationEventType.TRADE_REQUEST_CREATED}'
      AND EXISTS (
        SELECT 1 FROM trade_requests action_tr
        WHERE action_tr.id = ${alias}.reference_id
          AND action_tr.status = '${TradeRequestStatus.PENDING_SELLER}'
          AND action_tr.expires_at > NOW()
      ))
    OR (${alias}.event_type = '${NotificationEventType.TRADE_PAYMENT_REPORTED}'
      AND EXISTS (
        SELECT 1 FROM trades action_t
        WHERE action_t.id = ${alias}.reference_id
          AND action_t.status = '${TradeStatus.WAITING_SELLER_CONFIRMATION}'
      ))
    OR (${alias}.event_type = '${NotificationEventType.TRADE_REQUEST_ACCEPTED}'
      AND EXISTS (
        SELECT 1 FROM trades action_t
        WHERE action_t.id = ${alias}.reference_id
          AND action_t.status = '${TradeStatus.WAITING_BUYER_PAYMENT}'
      ))
  )`;
}

export function resolveActionState(
  eventType: NotificationEventType,
  required: boolean,
): NotificationActionState {
  if (!ACTIONABLE_NOTIFICATION_TYPES.has(eventType)) {
    return NotificationActionState.NONE;
  }
  return required
    ? NotificationActionState.REQUIRED
    : NotificationActionState.DONE;
}
