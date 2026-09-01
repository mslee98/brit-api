export enum NotificationOutboxStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  /** 구독 없음 등 — 장애가 아닌 미전달 */
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}
