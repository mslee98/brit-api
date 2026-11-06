import { EntityManager, QueryFailedError, Repository } from 'typeorm';

import { NotificationEventType } from './domain/enums/notification-event-type.enum';
import { NotificationReferenceType } from './domain/enums/notification-reference-type.enum';
import { NotificationEventEntity } from './infrastructure/entities/notification-event.entity';
import { NotificationOutboxEntity } from './infrastructure/entities/notification-outbox.entity';
import { NotificationRecipientEntity } from './infrastructure/entities/notification-recipient.entity';
import { NotificationStreamService } from './notification-stream.service';
import { NotificationService } from './notification.service';

type Row = Record<string, unknown>;

/** event / recipient / outbox 저장소를 메모리 배열로 흉내 낸다 */
function createInMemoryManager() {
  const events: Row[] = [];
  const recipients: Row[] = [];
  const outbox: Row[] = [];
  let seq = 0;

  const repoFor = (rows: Row[]) => ({
    create: (data: Row) => ({ ...data }),
    findOne: ({ where }: { where: Row }) =>
      Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
      ),
    save: (data: Row) => {
      if (
        rows === recipients &&
        rows.some(
          (row) =>
            row.notificationEventId === data.notificationEventId &&
            row.recipientUserId === data.recipientUserId,
        )
      ) {
        return Promise.reject(
          new QueryFailedError('INSERT', [], {
            code: '23505',
          } as unknown as Error),
        );
      }
      const saved = { id: `id-${++seq}`, createdAt: new Date(), ...data };
      rows.push(saved);
      return Promise.resolve(saved);
    },
  });

  const repos = new Map<unknown, ReturnType<typeof repoFor>>([
    [NotificationEventEntity, repoFor(events)],
    [NotificationRecipientEntity, repoFor(recipients)],
    [NotificationOutboxEntity, repoFor(outbox)],
  ]);

  const manager = {
    getRepository: (entity: unknown) => repos.get(entity),
    transaction: <T>(work: (inner: EntityManager) => Promise<T>) =>
      work(manager as unknown as EntityManager),
  };

  return {
    manager: manager as unknown as EntityManager,
    events,
    recipients,
    outbox,
  };
}

describe('NotificationService.enqueueTradePushInTransaction', () => {
  const publishToUser = jest.fn();
  const service = new NotificationService(
    {} as Repository<NotificationEventEntity>,
    {} as Repository<NotificationRecipientEntity>,
    {} as Repository<NotificationOutboxEntity>,
    { publishToUser } as unknown as NotificationStreamService,
  );

  const base = {
    eventType: NotificationEventType.TRADE_COMPLETED,
    actorUserId: null,
    referenceType: NotificationReferenceType.TRADE,
    referenceId: 'trade-1',
    deepLink: '/trade?tradeId=trade-1',
    tradeId: 'trade-1',
  };

  beforeEach(() => publishToUser.mockClear());

  it('양쪽 알림은 사건 1건 + 역할별 수신자 2건으로 저장된다', async () => {
    const db = createInMemoryManager();

    await service.enqueueTradePushInTransaction(db.manager, {
      ...base,
      recipientUserId: 'buyer-1',
      recipientRole: 'BUYER',
      snapshot: { coinAmount: '300000', counterpartyNicknameMasked: '판**' },
    });
    await service.enqueueTradePushInTransaction(db.manager, {
      ...base,
      recipientUserId: 'seller-1',
      recipientRole: 'SELLER',
      snapshot: { coinAmount: '300000', counterpartyNicknameMasked: '구**' },
    });

    expect(db.events).toHaveLength(1);
    expect(db.recipients).toHaveLength(2);
    expect(db.outbox).toHaveLength(2);
    expect(new Set(db.outbox.map((row) => row.notificationEventId))).toEqual(
      new Set([db.events[0].id]),
    );

    const [buyer, seller] = db.recipients;
    expect(buyer).toMatchObject({
      recipientUserId: 'buyer-1',
      recipientRole: 'BUYER',
      payload: { coinAmount: '300000', counterpartyNicknameMasked: '판**' },
    });
    expect(seller).toMatchObject({
      recipientUserId: 'seller-1',
      recipientRole: 'SELLER',
      payload: { coinAmount: '300000', counterpartyNicknameMasked: '구**' },
    });
    expect(buyer.message).not.toEqual(seller.message);
    expect(publishToUser).toHaveBeenCalledTimes(2);
  });

  it('같은 수신자 재발송은 무시된다', async () => {
    const db = createInMemoryManager();
    const input = {
      ...base,
      recipientUserId: 'buyer-1',
      recipientRole: 'BUYER' as const,
    };

    await service.enqueueTradePushInTransaction(db.manager, input);
    await service.enqueueTradePushInTransaction(db.manager, input);

    expect(db.events).toHaveLength(1);
    expect(db.recipients).toHaveLength(1);
    expect(db.outbox).toHaveLength(1);
  });
});
