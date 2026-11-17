/** partner_exchange_jobs.status — Worker 실행 축 (Exchange 상태와 분리) */
export enum PartnerExchangeJobStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}
