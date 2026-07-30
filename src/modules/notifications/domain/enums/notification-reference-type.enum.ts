/**
 * 알림이 가리키는 도메인 종류.
 * 초기: USER(가입 신청), USER_APPROVAL_REVIEW(승인·반려 이력).
 */
export enum NotificationReferenceType {
  USER = 'USER',
  USER_APPROVAL_REVIEW = 'USER_APPROVAL_REVIEW',
}
