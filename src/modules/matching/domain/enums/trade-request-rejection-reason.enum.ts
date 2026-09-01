/** 판매자 거절 사유 코드 (DB enum: trade_request_rejection_reason) */
export enum TradeRequestRejectionReason {
  NOT_AVAILABLE_NOW = 'NOT_AVAILABLE_NOW',
  AMOUNT_NOT_PREFERRED = 'AMOUNT_NOT_PREFERRED',
  OTHER = 'OTHER',
}
