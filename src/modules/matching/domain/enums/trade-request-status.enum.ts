/** TradeRequest 상태 (DB enum: trade_request_status) */
export enum TradeRequestStatus {
  PENDING_SELLER = 'PENDING_SELLER',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED_BY_BUYER = 'CANCELLED_BY_BUYER',
}
