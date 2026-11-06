/**
 * TradeRequest 진입 경로 (DB: trade_requests.origin, CHECK).
 * MARKET은 거절·만료·취소 시 BuyOrder를 MATCHING으로 되돌리지 않고 CANCELLED로 닫는다.
 */
export enum TradeRequestOrigin {
  MATCHING = 'MATCHING',
  MARKET = 'MARKET',
}
