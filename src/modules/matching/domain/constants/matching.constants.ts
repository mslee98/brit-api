/** MATCHING 탐색 세션 TTL (초). 초과 시 Worker가 EXPIRED 처리. REQUEST_PENDING은 대상 아님. */
export const BUY_MATCHING_TIMEOUT_SECONDS = 900;

/** Lifecycle worker 1회 배치 크기 (Buy TTL) */
export const MATCHING_EXPIRY_BATCH_SIZE = 50;

/** TradeRequest PENDING TTL 만료 배치 크기 */
export const TRADE_REQUEST_EXPIRY_BATCH_SIZE = 50;

/** Worker 폴링 간격(ms) — Buy TTL + Request TTL 공유 */
export const MATCHING_EXPIRY_INTERVAL_MS = 2000;

/** Candidate 목록 기본/최대 limit */
export const CANDIDATE_DEFAULT_LIMIT = 20;
export const CANDIDATE_MAX_LIMIT = 50;
