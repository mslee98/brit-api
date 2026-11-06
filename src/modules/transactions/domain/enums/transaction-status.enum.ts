/**
 * 화면용 상태. 원본 상태를 5가지로 묶는다.
 * CHECKING은 분쟁·업체 대사 확인. 필터에서는 PROCESSING에 포함한다.
 */
export enum TransactionStatus {
  COMPLETED = 'COMPLETED',
  PROCESSING = 'PROCESSING',
  CHECKING = 'CHECKING',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum TransactionStatusFilter {
  COMPLETED = 'COMPLETED',
  PROCESSING = 'PROCESSING',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}
