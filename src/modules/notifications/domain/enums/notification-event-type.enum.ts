/**
 * 알림 대상 업무 종류.
 * 초기 범위는 가입 승인만. 분쟁·업체 전환은 해당 도메인 도입 시 추가.
 */
export enum NotificationEventType {
  /** 신규 가입 제출 → 관리자 승인 필요 */
  USER_REGISTRATION_REQUESTED = 'USER_REGISTRATION_REQUESTED',
  /**
   * 가입 승인 완료 → 신청자 수신.
   * PENDING 사용자는 로그인 불가이므로 인앱 조회는 후속(SMS 등) 채널용.
   */
  USER_REGISTRATION_APPROVED = 'USER_REGISTRATION_APPROVED',
  /**
   * 가입 반려 → 신청자 수신.
   * REJECTED 사용자는 로그인 불가이므로 인앱 조회는 후속 채널용.
   */
  USER_REGISTRATION_REJECTED = 'USER_REGISTRATION_REJECTED',
  /** 구매자 Apply → 판매자 */
  TRADE_REQUEST_CREATED = 'TRADE_REQUEST_CREATED',
  /** 판매자 Accept → 구매자 */
  TRADE_REQUEST_ACCEPTED = 'TRADE_REQUEST_ACCEPTED',
  /** 구매자 입금 신고 → 판매자 */
  TRADE_PAYMENT_REPORTED = 'TRADE_PAYMENT_REPORTED',
  /** Trade COMPLETED → 구매자 */
  TRADE_COMPLETED = 'TRADE_COMPLETED',
  /** 판매자 거절 → 구매자 */
  TRADE_REQUEST_REJECTED = 'TRADE_REQUEST_REJECTED',
  /** 입금·요청 만료 → 구매·판매 */
  TRADE_EXPIRED = 'TRADE_EXPIRED',
  /** 거래 취소 → 구매·판매 */
  TRADE_CANCELLED = 'TRADE_CANCELLED',
  /** 분쟁 개시 → 구매·판매 */
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  /** 분쟁 해결 → 구매·판매 */
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
}
