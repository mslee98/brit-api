/** partner_exchange_attempts.result — 호출 수송/진행 상태 */
export enum PartnerExchangeAttemptResult {
  REQUESTED = 'REQUESTED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  PROCESSING = 'PROCESSING',
  UNKNOWN = 'UNKNOWN',
  TRANSPORT_ERROR = 'TRANSPORT_ERROR',
}
