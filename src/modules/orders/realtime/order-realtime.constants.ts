export const ORDER_WS_NAMESPACE = '/orders';

export const ORDER_WS_EVENTS = {
  JOIN_BUY_ORDER: 'buy-order.join',
  LEAVE_BUY_ORDER: 'buy-order.leave',
  BUY_UPDATED: 'buy-order.updated',
  SELL_UPDATED: 'sell-order.updated',
  REQUEST_UPDATED: 'trade-request.updated',
  MATCHING_CHANGED: 'matching.changed',
} as const;

export function orderUserRoom(userId: string): string {
  return `user:${userId}`;
}

export function buyOrderRoom(buyOrderId: string): string {
  return `buy-order:${buyOrderId}`;
}
