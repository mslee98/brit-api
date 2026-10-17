import { TradeDisputeStatus } from '../enums/trade-dispute-status.enum';

/** Timeout / recovery worker 폴링 간격(ms) */
export const TRADE_TIMEOUT_INTERVAL_MS = 2000;

/** Worker 1회 배치 크기 */
export const TRADE_TIMEOUT_BATCH_SIZE = 50;

/** COIN_TRANSFERRING 재처리 최소 경과(ms). confirm TX A와 겹치지 않게 둔다. */
export const TRANSFER_RECOVERY_MIN_AGE_MS = 2000;

export const TRADE_LEDGER_REFERENCE_TYPE = 'TRADE';

/** 인박스 기본 큐. status 미지정 시 열린 분쟁만. */
export const OPEN_DISPUTE_STATUSES: TradeDisputeStatus[] = [
  TradeDisputeStatus.OPEN_UNASSIGNED,
  TradeDisputeStatus.ASSIGNED,
  TradeDisputeStatus.IN_REVIEW,
  TradeDisputeStatus.EVIDENCE_REQUIRED,
];

/** 사용자에게 노출하는 담당자 표시명. 실명 금지. */
export const DISPUTE_TEAM_DISPLAY_NAME = 'Brit 분쟁조정팀';

export const DISPUTE_SYSTEM_MESSAGE_JOINED = '상담원이 합류했어요.';

export const DISPUTE_SYSTEM_MESSAGE_CLOSED =
  '검토가 끝났어요. 더 이상 메시지를 보낼 수 없어요.';

export const DISPUTE_MESSAGE_MAX_LENGTH = 2000;

/** 입금 신고 철회 가능 시간(ms). 판매자 미확인·신고 후 10분. */
export const PAYMENT_REPORT_WITHDRAW_WINDOW_MS = 10 * 60 * 1000;

/** 분쟁 증빙 이미지 최대 크기(bytes). */
export const DISPUTE_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
