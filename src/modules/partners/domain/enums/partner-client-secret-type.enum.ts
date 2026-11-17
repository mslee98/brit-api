/** partner_client_secrets.secret_type */
export enum PartnerClientSecretType {
  API_SECRET = 'API_SECRET',
  WEBHOOK_SECRET = 'WEBHOOK_SECRET',
  /** BRIT → 업체 Operations HMAC 서명용 (원문은 secret_encrypted) */
  OPERATIONS_SIGNING_SECRET = 'OPERATIONS_SIGNING_SECRET',
}
