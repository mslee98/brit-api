/**
 * 사용자 계좌 상태 (DB enum: bank_account_status).
 * 계좌번호는 덮어쓰지 않고 이력 행을 추가한다.
 *
 * - PENDING_APPROVAL: 가입/변경 신청 직후
 * - ACTIVE: 입금·출금 가능
 * - SUSPENDED: 일시 정지
 * - RETIRED: 신규 거래 불가, 기존 거래 확인만
 * - CLOSED: 최종 종료
 * - REJECTED: 심사 반려
 */
export enum UserBankAccountStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
}
