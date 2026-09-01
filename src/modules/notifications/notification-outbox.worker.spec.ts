import { DataSource } from 'typeorm';
import webpush from 'web-push';

import { NotificationOutboxStatus } from './domain/enums/notification-outbox-status.enum';
import { NotificationEventType } from './domain/enums/notification-event-type.enum';
import { NotificationOutboxEntity } from './infrastructure/entities/notification-outbox.entity';
import { NotificationOutboxWorker } from './notification-outbox.worker';
import { PushSubscriptionService } from './push-subscription.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

type DeliverWorker = NotificationOutboxWorker & {
  deliver: (item: NotificationOutboxEntity) => Promise<void>;
};

function createOutboxItem(
  overrides: Partial<NotificationOutboxEntity> = {},
): NotificationOutboxEntity {
  return {
    id: 'outbox-1',
    notificationEventId: 'event-1',
    recipientUserId: 'user-1',
    status: NotificationOutboxStatus.PENDING,
    attemptCount: 1,
    nextAttemptAt: new Date(),
    lastError: null,
    payload: {
      notificationId: 'event-1',
      type: NotificationEventType.TRADE_COMPLETED,
      eventType: NotificationEventType.TRADE_COMPLETED,
      title: '거래가 완료됐어요',
      body: '코인이 들어왔어요',
      deepLink: '/trade?tradeId=t1',
      message: '코인이 들어왔어요',
      url: '/trade?tradeId=t1',
      referenceType: 'TRADE',
      referenceId: 't1',
      tradeId: 't1',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as NotificationOutboxEntity;
}

describe('NotificationOutboxWorker', () => {
  let worker: DeliverWorker;
  let pushSubscriptionService: jest.Mocked<
    Pick<PushSubscriptionService, 'findByUserId' | 'deleteById' | 'getVapidDetails'>
  >;
  let outboxUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    outboxUpdate = jest.fn().mockResolvedValue(undefined);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ update: outboxUpdate }),
      transaction: jest.fn(),
    } as unknown as DataSource;

    pushSubscriptionService = {
      getVapidDetails: jest.fn().mockReturnValue({
        publicKey: 'public-key',
        privateKey: 'private-key',
        subject: 'mailto:test@brit.local',
      }),
      findByUserId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };

    worker = new NotificationOutboxWorker(
      dataSource,
      pushSubscriptionService as unknown as PushSubscriptionService,
    ) as DeliverWorker;
  });

  it('marks SKIPPED when recipient has no push subscriptions', async () => {
    pushSubscriptionService.findByUserId.mockResolvedValue([]);

    await worker.deliver(createOutboxItem());

    expect(outboxUpdate).toHaveBeenCalledWith(
      { id: 'outbox-1' },
      {
        status: NotificationOutboxStatus.SKIPPED,
        lastError: 'NO_SUBSCRIPTION',
      },
    );
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('deletes expired subscription on 410 and marks SENT when no retryable error remains', async () => {
    const subscription = {
      id: 'sub-1',
      endpoint: 'https://push.example/1',
      p256dh: 'p256dh',
      auth: 'auth',
    };
    pushSubscriptionService.findByUserId.mockResolvedValue([
      subscription,
    ] as never);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });

    await worker.deliver(createOutboxItem());

    expect(pushSubscriptionService.deleteById).toHaveBeenCalledWith('sub-1');
    expect(outboxUpdate).toHaveBeenCalledWith(
      { id: 'outbox-1' },
      { status: NotificationOutboxStatus.SENT, lastError: null },
    );
  });

  it('deletes gone subscription on 404', async () => {
    const subscription = {
      id: 'sub-2',
      endpoint: 'https://push.example/2',
      p256dh: 'p256dh',
      auth: 'auth',
    };
    pushSubscriptionService.findByUserId.mockResolvedValue([
      subscription,
    ] as never);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 404,
    });

    await worker.deliver(createOutboxItem());

    expect(pushSubscriptionService.deleteById).toHaveBeenCalledWith('sub-2');
  });
});
