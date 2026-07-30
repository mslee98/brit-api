/**
 * 계좌에 대한 관리자 조치 (user_bank_account_reviews.decision).
 * previous_status → resulting_status 전이의 원인을 남긴다.
 */
export enum BankAccountReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  REACTIVATED = 'REACTIVATED',
  RETIRED = 'RETIRED',
  CLOSED = 'CLOSED',
}
