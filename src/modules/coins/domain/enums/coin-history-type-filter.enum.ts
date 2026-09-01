/**
 * 사용자/관리자 Coin 이력 type 필터 (presentation group).
 * 실제 ledger entry_type과 1:N 매핑된다.
 */
export enum CoinHistoryTypeFilter {
  ALL = 'ALL',
  BRIT_PURCHASE = 'BRIT_PURCHASE',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}
