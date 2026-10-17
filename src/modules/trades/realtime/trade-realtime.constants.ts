export const TRADE_WS_NAMESPACE = '/trades';

export const TRADE_WS_EVENTS = {
  UPDATED: 'trade.updated',
} as const;

export function tradeUserRoom(userId: string): string {
  return `user:${userId}`;
}
