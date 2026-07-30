/** Refresh 세션 상태 (DB enum: session_status) */
export enum UserSessionStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}
