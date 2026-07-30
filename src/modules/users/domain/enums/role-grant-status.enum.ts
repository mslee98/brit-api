/** 전역 역할 부여 이력의 활성 여부 (DB enum: role_grant_status) */
export enum RoleGrantStatus {
  ACTIVE = 'ACTIVE',
  /** 회수됨. revoked_at 필수 */
  REVOKED = 'REVOKED',
}
