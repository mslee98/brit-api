/** Timeout / recovery worker 폴링 간격(ms) */
export const TRADE_TIMEOUT_INTERVAL_MS = 2000;

/** Worker 1회 배치 크기 */
export const TRADE_TIMEOUT_BATCH_SIZE = 50;

/** COIN_TRANSFERRING 재처리 최소 경과(ms). confirm TX A와 겹치지 않게 둔다. */
export const TRANSFER_RECOVERY_MIN_AGE_MS = 2000;

export const TRADE_LEDGER_REFERENCE_TYPE = 'TRADE';
