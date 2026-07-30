/**
 * Brit 전역 역할 (DB enum: user_role).
 * 업체(partner) 내부 역할과는 별개 — 그쪽은 partner_members가 소유.
 *
 * - USER: 일반 사용자 (가입 시 기본 부여)
 * - ADMIN: 관리자
 * - SYS_ADMIN: 시스템 관리자
 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SYS_ADMIN = 'SYS_ADMIN',
}
