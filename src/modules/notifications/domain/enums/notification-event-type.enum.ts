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
}
