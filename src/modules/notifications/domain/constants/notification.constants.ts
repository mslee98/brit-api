import { NotificationEventType } from '../enums/notification-event-type.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';

export const NOTIFICATION_OUTBOX_INTERVAL_MS = 2000;
export const NOTIFICATION_OUTBOX_BATCH_SIZE = 20;
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 8;

export type NotificationRecipientRole =
  | 'SELLER'
  | 'BUYER'
  | 'BOTH'
  | 'ADMINS'
  | 'APPLICANT';

export type NotificationCopyRole = 'BUYER' | 'SELLER';

export type NotificationPolicyEntry = {
  eventType: NotificationEventType;
  recipientRole: NotificationRecipientRole;
  inApp: boolean;
  push: boolean;
  priority: NotificationPriority;
  /** Web Push TTL (seconds). */
  ttlSeconds: number;
  title: string;
  body: string;
  titleByRole?: Partial<Record<NotificationCopyRole, string>>;
  bodyByRole?: Partial<Record<NotificationCopyRole, string>>;
};

/**
 * 알림 정책 SoT.
 * TradeEventCode(업무 사실)와 분리된 사용자 알림 wire 코드.
 * Push·향후 SSE/WS가 동일한 NotificationEventType 문자열을 사용한다.
 */
export const NOTIFICATION_POLICY: Record<
  NotificationEventType,
  NotificationPolicyEntry
> = {
  [NotificationEventType.USER_REGISTRATION_REQUESTED]: {
    eventType: NotificationEventType.USER_REGISTRATION_REQUESTED,
    recipientRole: 'ADMINS',
    inApp: true,
    push: false,
    priority: NotificationPriority.NORMAL,
    ttlSeconds: 86_400,
    title: '신규 가입 승인 요청',
    body: '신규 사용자의 가입 정보 검토가 필요합니다.',
  },
  [NotificationEventType.USER_REGISTRATION_APPROVED]: {
    eventType: NotificationEventType.USER_REGISTRATION_APPROVED,
    recipientRole: 'APPLICANT',
    inApp: true,
    push: false,
    priority: NotificationPriority.NORMAL,
    ttlSeconds: 86_400,
    title: '가입 승인이 완료되었습니다',
    body: '관리자 검토가 완료되어 서비스를 이용할 수 있습니다.',
  },
  [NotificationEventType.USER_REGISTRATION_REJECTED]: {
    eventType: NotificationEventType.USER_REGISTRATION_REJECTED,
    recipientRole: 'APPLICANT',
    inApp: true,
    push: false,
    priority: NotificationPriority.NORMAL,
    ttlSeconds: 86_400,
    title: '가입 신청 검토 결과',
    body: '가입 신청이 반려되었습니다. 반려 사유를 확인해 주세요.',
  },
  [NotificationEventType.TRADE_REQUEST_CREATED]: {
    eventType: NotificationEventType.TRADE_REQUEST_CREATED,
    recipientRole: 'SELLER',
    inApp: true,
    push: true,
    priority: NotificationPriority.HIGH,
    ttlSeconds: 180,
    title: '구매 신청이 왔어요',
    body: '구매 신청이 왔어요',
  },
  [NotificationEventType.TRADE_REQUEST_ACCEPTED]: {
    eventType: NotificationEventType.TRADE_REQUEST_ACCEPTED,
    recipientRole: 'BUYER',
    inApp: true,
    push: true,
    priority: NotificationPriority.HIGH,
    ttlSeconds: 86_400,
    title: '거래가 성사됐어요',
    body: '거래가 성사됐어요. 입금해 주세요',
  },
  [NotificationEventType.TRADE_PAYMENT_REPORTED]: {
    eventType: NotificationEventType.TRADE_PAYMENT_REPORTED,
    recipientRole: 'SELLER',
    inApp: true,
    push: true,
    priority: NotificationPriority.URGENT,
    ttlSeconds: 86_400,
    title: '입금 확인이 필요해요',
    body: '구매자가 입금했다고 했어요',
  },
  [NotificationEventType.TRADE_COMPLETED]: {
    eventType: NotificationEventType.TRADE_COMPLETED,
    recipientRole: 'BOTH',
    inApp: true,
    push: true,
    priority: NotificationPriority.HIGH,
    ttlSeconds: 86_400,
    title: '거래가 완료됐어요',
    body: '거래가 완료됐어요',
    titleByRole: {
      BUYER: '거래가 완료됐어요',
      SELLER: '거래가 완료됐어요',
    },
    bodyByRole: {
      BUYER: '코인이 들어왔어요',
      SELLER: '거래가 정상적으로 끝났어요',
    },
  },
};

export function getNotificationPolicy(
  eventType: NotificationEventType,
): NotificationPolicyEntry {
  return NOTIFICATION_POLICY[eventType];
}

export function getNotificationCopy(
  eventType: NotificationEventType,
  role?: NotificationCopyRole,
): { title: string; body: string } {
  const policy = getNotificationPolicy(eventType);
  if (!role) {
    return { title: policy.title, body: policy.body };
  }
  return {
    title: policy.titleByRole?.[role] ?? policy.title,
    body: policy.bodyByRole?.[role] ?? policy.body,
  };
}

/** @deprecated Prefer getNotificationCopy / NOTIFICATION_POLICY */
export const TRADE_PUSH_COPY = {
  REQUEST_CREATED: {
    title: NOTIFICATION_POLICY.TRADE_REQUEST_CREATED.title,
    message: NOTIFICATION_POLICY.TRADE_REQUEST_CREATED.body,
  },
  REQUEST_ACCEPTED: {
    title: NOTIFICATION_POLICY.TRADE_REQUEST_ACCEPTED.title,
    message: NOTIFICATION_POLICY.TRADE_REQUEST_ACCEPTED.body,
  },
  PAYMENT_REPORTED: {
    title: NOTIFICATION_POLICY.TRADE_PAYMENT_REPORTED.title,
    message: NOTIFICATION_POLICY.TRADE_PAYMENT_REPORTED.body,
  },
  COMPLETED: {
    title: NOTIFICATION_POLICY.TRADE_COMPLETED.title,
    message: NOTIFICATION_POLICY.TRADE_COMPLETED.body,
  },
  COMPLETED_BUYER: {
    title: NOTIFICATION_POLICY.TRADE_COMPLETED.titleByRole!.BUYER!,
    message: NOTIFICATION_POLICY.TRADE_COMPLETED.bodyByRole!.BUYER!,
  },
  COMPLETED_SELLER: {
    title: NOTIFICATION_POLICY.TRADE_COMPLETED.titleByRole!.SELLER!,
    message: NOTIFICATION_POLICY.TRADE_COMPLETED.bodyByRole!.SELLER!,
  },
} as const;

/**
 * Push·향후 SSE/WS 공용 wire.
 * type = NotificationEventType. body/deepLink가 정식, message/url은 호환.
 */
export type TradePushPayload = {
  notificationId: string;
  type: NotificationEventType | string;
  title: string;
  body: string;
  deepLink: string;
  /** @deprecated use `type` */
  eventType: string;
  /** @deprecated use `body` */
  message: string;
  /** @deprecated use `deepLink` */
  url: string;
  referenceType: string;
  referenceId: string;
  tradeId?: string;
  sellOrderId?: string;
  buyOrderId?: string;
};

export function buildTradePushPayload(input: {
  notificationId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  deepLink: string;
  referenceType: string;
  referenceId: string;
  tradeId?: string;
  sellOrderId?: string;
  buyOrderId?: string;
}): TradePushPayload {
  return {
    notificationId: input.notificationId,
    type: input.eventType,
    title: input.title,
    body: input.body,
    deepLink: input.deepLink,
    eventType: input.eventType,
    message: input.body,
    url: input.deepLink,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    tradeId: input.tradeId,
    sellOrderId: input.sellOrderId,
    buyOrderId: input.buyOrderId,
  };
}

export function resolvePushTtlSeconds(payload: TradePushPayload): number {
  const type = (payload.type ?? payload.eventType) as NotificationEventType;
  const policy = NOTIFICATION_POLICY[type];
  return policy?.ttlSeconds ?? 86_400;
}
