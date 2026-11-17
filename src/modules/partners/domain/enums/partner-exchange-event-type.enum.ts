/** partner_exchange_events.event_type — B4-3 완료 사실 영속 (Webhook 전송은 B4-5) */
export enum PartnerExchangeEventType {
  MERCHANT_PAYMENT_COMPLETED = 'MERCHANT_PAYMENT_COMPLETED',
  MERCHANT_PAYMENT_FAILED = 'MERCHANT_PAYMENT_FAILED',
}
