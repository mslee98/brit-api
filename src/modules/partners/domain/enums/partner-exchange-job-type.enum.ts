/**
 * partner_exchange_jobs.job_type — 실행해야 할 작업 종류.
 * SETTLE은 DB 제약·향후 분리 예약용. 현재 Worker는 STATUS_SYNC 후 settleIfTerminal로 확정한다.
 */
export enum PartnerExchangeJobType {
  CREDIT = 'CREDIT',
  STATUS_SYNC = 'STATUS_SYNC',
  SETTLE = 'SETTLE',
}
