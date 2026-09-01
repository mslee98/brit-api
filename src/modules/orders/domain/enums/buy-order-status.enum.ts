/** 구매 주문 상태 (DB enum: buy_order_status) */
export enum BuyOrderStatus {
  MATCHING = 'MATCHING',
  /** 판매자 수락 대기 (TradeRequest PENDING_SELLER) */
  REQUEST_PENDING = 'REQUEST_PENDING',
  MATCHED = 'MATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
