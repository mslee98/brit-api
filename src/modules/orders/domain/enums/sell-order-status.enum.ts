/** 판매 주문 상태 (DB enum: sell_order_status) */
export enum SellOrderStatus {
  OPEN = 'OPEN',
  PARTIALLY_MATCHED = 'PARTIALLY_MATCHED',
  FULLY_RESERVED = 'FULLY_RESERVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
