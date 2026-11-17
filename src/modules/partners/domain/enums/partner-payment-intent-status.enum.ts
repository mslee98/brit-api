/** partner_payment_intents.status — CHARGE Intent (B3 sync / B4 lock) */
export enum PartnerPaymentIntentStatus {
  CREATED = 'CREATED',
  USER_AUTHORIZED = 'USER_AUTHORIZED',
  /** B4-1: MS 잠금·Exchange ASSET_LOCKED 이후 (credit 대기) */
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
