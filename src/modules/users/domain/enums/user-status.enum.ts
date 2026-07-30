/**
 * 사용자 가입·이용 상태 (DB enum: user_status).
 *
 * - PENDING: 가입 제출 후 관리자 승인 대기 — 로그인 불가
 * - ACTIVE: 승인 완료 — 로그인 가능 (approved_at/approved_by 필수)
 * - SUSPENDED: 이용 정지
 * - WITHDRAWN: 탈퇴 (withdrawn_at 필수)
 * - REJECTED: 가입 반려 (rejected_at + rejection_reason 필수)
 */
export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  WITHDRAWN = 'WITHDRAWN',
  REJECTED = 'REJECTED',
}
