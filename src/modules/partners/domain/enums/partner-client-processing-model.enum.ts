/** partner_clients.processing_model — B3 confirm vs B4 Operations */
export enum PartnerClientProcessingModel {
  /** 업체가 Intent COMPLETED 후 confirm으로 적립 (B3 PoC) */
  LEGACY_CONFIRM = 'LEGACY_CONFIRM',
  /** BRIT가 업체 Operations CREDIT/STATUS 호출 (B4) */
  BRIT_OPERATIONS = 'BRIT_OPERATIONS',
}
