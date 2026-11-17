/** B4-4 partner_exchange_jobs Worker */
export const PARTNER_EXCHANGE_JOB_INTERVAL_MS = 2_000;
export const PARTNER_EXCHANGE_JOB_BATCH_SIZE = 20;
export const PARTNER_EXCHANGE_JOB_LEASE_MS = 30_000;
/** 이 횟수 이상 비종료면 Exchange → RECONCILIATION_REQUIRED */
export const PARTNER_EXCHANGE_JOB_RECON_AFTER_ATTEMPTS = 20;
/** 대사 대기 중 저빈도 STATUS 주기 */
export const PARTNER_EXCHANGE_JOB_RECON_BACKOFF_MS = 60 * 60 * 1000;

export const PARTNER_EXCHANGE_JOB_BACKOFF_MS = [
  2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000,
] as const;
