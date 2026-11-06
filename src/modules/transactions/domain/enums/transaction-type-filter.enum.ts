/** 화면 칩 단위 필터. BUY는 P2P 구매와 Brit 구매를 함께 본다. */
export enum TransactionTypeFilter {
  ALL = 'ALL',
  BUY = 'BUY',
  SELL = 'SELL',
  CHARGE = 'CHARGE',
  REDEEM = 'REDEEM',
  ADJUSTMENT = 'ADJUSTMENT',
}
