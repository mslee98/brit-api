/**
 * partner_exchanges.external_result_status — 업체 Operations 최종(투영) 결과.
 * Exchange.status(PARTNER_PROCESSING 등)와 분리한다.
 */
export enum PartnerExternalResultStatus {
  NOT_REQUESTED = 'NOT_REQUESTED',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  /** 조회만 했을 때 기록 없음 — 단독으로 최종 실패 금지 */
  NOT_FOUND = 'NOT_FOUND',
}
