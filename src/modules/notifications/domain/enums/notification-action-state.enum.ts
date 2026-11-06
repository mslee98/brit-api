/**
 * 알림의 「확인 필요」 상태. 읽음(is_read)과 별개로, 연결된 업무의 현재 상태로 판정한다.
 */
export enum NotificationActionState {
  /** 수신자가 지금 처리해야 한다 */
  REQUIRED = 'REQUIRED',
  /** 처리가 필요했던 알림이지만 이미 처리·종료됐다 */
  DONE = 'DONE',
  /** 결과를 알려 주는 정보성 알림 */
  NONE = 'NONE',
}
