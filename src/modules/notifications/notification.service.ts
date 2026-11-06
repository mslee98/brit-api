import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import {
  buildTradePushPayload,
  getNotificationCopy,
  getNotificationPolicy,
  type NotificationCopyRole,
  type TradePushPayload,
} from './domain/constants/notification.constants';
import { NotificationActionState } from './domain/enums/notification-action-state.enum';
import { NotificationEventType } from './domain/enums/notification-event-type.enum';
import { NotificationInboxFilter } from './domain/enums/notification-inbox-filter.enum';
import { NotificationOutboxStatus } from './domain/enums/notification-outbox-status.enum';
import { NotificationPriority } from './domain/enums/notification-priority.enum';
import { NotificationReferenceType } from './domain/enums/notification-reference-type.enum';
import {
  ACTIONABLE_NOTIFICATION_TYPES,
  actionRequiredSql,
  resolveActionState,
} from './domain/notification-action-state';
import { NotificationDomainException } from './exceptions/notification.exceptions';
import { NotificationEventEntity } from './infrastructure/entities/notification-event.entity';
import { NotificationOutboxEntity } from './infrastructure/entities/notification-outbox.entity';
import { NotificationRecipientEntity } from './infrastructure/entities/notification-recipient.entity';
import { NotificationStreamService } from './notification-stream.service';

export type EnqueueTradePushInput = {
  eventType: NotificationEventType;
  actorUserId: string | null;
  referenceType: NotificationReferenceType;
  referenceId: string;
  deepLink: string;
  recipientUserId: string;
  /** TRADE_COMPLETED 등 역할별 카피 */
  recipientRole?: NotificationCopyRole;
  /** 알림 목록 메타 줄(수량·상대방). 호출 도메인이 발송 시점 값으로 채운다 */
  snapshot?: NotificationTradeSnapshot;
  tradeId?: string;
  sellOrderId?: string;
  buyOrderId?: string;
};

export type NotificationTradeSnapshot = {
  coinAmount: string;
  counterpartyNicknameMasked: string;
};

export type CreateNotificationEventInput = {
  eventType: NotificationEventType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actorUserId: string | null;
  referenceType: NotificationReferenceType;
  referenceId: string;
  actionPath: string | null;
  payload?: Record<string, unknown>;
  recipientUserIds: string[];
  occurredAt?: Date;
};

type NotificationEventInput = Omit<
  CreateNotificationEventInput,
  'recipientUserIds'
>;

/** 수신자별로 다르게 보여 줄 값. 없으면 사건(event)의 값을 쓴다 */
type RecipientPresentation = {
  recipientRole: NotificationCopyRole | null;
  title: string;
  message: string;
  actionPath: string | null;
  payload: Record<string, unknown>;
};

export type NotificationInboxCounts = {
  unreadCount: number;
  actionRequiredCount: number;
};

/** event.title/message/actionPath는 수신자별 값이 있으면 그것으로 해석된 값 */
export type NotificationListItem = {
  recipientNotificationId: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  recipientRole: NotificationCopyRole | null;
  payload: Record<string, unknown>;
  actionState: NotificationActionState;
  event: {
    id: string;
    eventType: NotificationEventType;
    priority: NotificationPriority;
    title: string;
    message: string;
    referenceType: NotificationReferenceType;
    referenceId: string;
    actionPath: string | null;
    occurredAt: Date;
  };
};

export type NotificationOutboxListItem = {
  id: string;
  notificationEventId: string;
  recipientUserId: string;
  status: NotificationOutboxStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 알림 사건·수신 관리.
 *
 * 가입 요청(USER_REGISTRATION_REQUESTED)은 관리자 수신이 1차 범위.
 * APPROVED/REJECTED 신청자 수신 행은 저장하나, 미로그인 상태에서는
 * 인앱 조회 불가 — 후속 SMS 등 채널용.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEventEntity)
    private readonly eventRepository: Repository<NotificationEventEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipientRepository: Repository<NotificationRecipientEntity>,
    @InjectRepository(NotificationOutboxEntity)
    private readonly outboxRepository: Repository<NotificationOutboxEntity>,
    private readonly notificationStreamService: NotificationStreamService,
  ) {}

  async createEventWithRecipientsInTransaction(
    manager: EntityManager,
    input: CreateNotificationEventInput,
  ): Promise<NotificationEventEntity> {
    const { recipientUserIds, ...eventInput } = input;
    const event = await this.insertEvent(manager, eventInput);
    for (const recipientUserId of new Set(recipientUserIds)) {
      await this.insertRecipient(manager, event, recipientUserId);
    }
    return event;
  }

  /**
   * 거래 푸시: 같은 업무 TX의 savepoint에서 event + recipient + outbox INSERT.
   * 양쪽 당사자 알림은 사건 1건에 수신자 행이 역할별 문구로 하나씩 붙는다.
   * 문구·우선순위는 NOTIFICATION_POLICY에서 조회한다.
   * unique 충돌·푸시 실패는 업무 커밋을 막지 않는다.
   */
  async enqueueTradePushInTransaction(
    manager: EntityManager,
    input: EnqueueTradePushInput,
  ): Promise<void> {
    const policy = getNotificationPolicy(input.eventType);
    if (!policy.push) {
      return;
    }
    const copy = getNotificationCopy(input.eventType, input.recipientRole);

    await this.runPushEnqueue(
      `trade type=${input.eventType} ref=${input.referenceId}`,
      manager,
      async (inner) => {
        const event = await this.findOrCreateEvent(inner, {
          eventType: input.eventType,
          priority: policy.priority,
          title: copy.title,
          message: copy.body,
          actorUserId: input.actorUserId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          actionPath: input.deepLink,
        });
        await this.insertRecipient(inner, event, input.recipientUserId, {
          recipientRole: input.recipientRole ?? null,
          title: copy.title,
          message: copy.body,
          actionPath: input.deepLink,
          payload: input.snapshot ?? {},
        });
        await this.insertOutbox(
          inner,
          event,
          input.recipientUserId,
          buildTradePushPayload({
            notificationId: event.id,
            eventType: input.eventType,
            title: copy.title,
            body: copy.body,
            deepLink: input.deepLink,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            tradeId: input.tradeId,
            sellOrderId: input.sellOrderId,
            buyOrderId: input.buyOrderId,
          }),
        );
      },
    );
  }

  /** DEV 전용: 로그인 사용자에게 테스트 Web Push outbox 1건. */
  async enqueueDevTestPush(
    recipientUserId: string,
  ): Promise<{ queued: true; referenceId: string }> {
    const referenceId = randomUUID();
    const title = '테스트 알림';
    const body = 'OS 알림이 보이면 푸시 경로는 살아 있어요';

    await this.eventRepository.manager.transaction(async (manager) => {
      const event = await this.createEventWithRecipientsInTransaction(manager, {
        eventType: NotificationEventType.TRADE_COMPLETED,
        title,
        message: body,
        actorUserId: recipientUserId,
        referenceType: NotificationReferenceType.USER,
        referenceId,
        actionPath: '/',
        recipientUserIds: [recipientUserId],
      });
      await this.insertOutbox(
        manager,
        event,
        recipientUserId,
        buildTradePushPayload({
          notificationId: event.id,
          eventType: NotificationEventType.TRADE_COMPLETED,
          title,
          body,
          deepLink: '/',
          referenceType: NotificationReferenceType.USER,
          referenceId,
        }),
      );
    });

    return { queued: true, referenceId };
  }

  /**
   * 가입 승인/반려 Push + Inbox.
   */
  async enqueueRegistrationPushInTransaction(
    manager: EntityManager,
    input: {
      eventType:
        | NotificationEventType.USER_REGISTRATION_APPROVED
        | NotificationEventType.USER_REGISTRATION_REJECTED;
      actorUserId: string;
      referenceType: NotificationReferenceType;
      referenceId: string;
      deepLink: string;
      recipientUserId: string;
    },
  ): Promise<void> {
    const policy = getNotificationPolicy(input.eventType);
    if (!policy.push) {
      return;
    }
    const copy = getNotificationCopy(input.eventType);

    await this.runPushEnqueue(
      `registration type=${input.eventType}`,
      manager,
      async (inner) => {
        const event = await this.createEventWithRecipientsInTransaction(inner, {
          eventType: input.eventType,
          priority: policy.priority,
          title: copy.title,
          message: copy.body,
          actorUserId: input.actorUserId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          actionPath: input.deepLink,
          recipientUserIds: [input.recipientUserId],
        });
        await this.insertOutbox(
          inner,
          event,
          input.recipientUserId,
          buildTradePushPayload({
            notificationId: event.id,
            eventType: input.eventType,
            title: copy.title,
            body: copy.body,
            deepLink: input.deepLink,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
          }),
        );
      },
    );
  }

  /** savepoint에서 실행하고, 중복(unique)·기타 실패는 로그만 남겨 업무 커밋을 막지 않는다 */
  private async runPushEnqueue(
    label: string,
    manager: EntityManager,
    work: (inner: EntityManager) => Promise<void>,
  ): Promise<void> {
    try {
      await manager.transaction(work);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return;
      }
      this.logger.warn(
        `push enqueue failed ${label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async insertEvent(
    manager: EntityManager,
    input: NotificationEventInput,
  ): Promise<NotificationEventEntity> {
    const eventRepository = manager.getRepository(NotificationEventEntity);
    return eventRepository.save(
      eventRepository.create({
        eventType: input.eventType,
        priority: input.priority ?? NotificationPriority.NORMAL,
        title: input.title,
        message: input.message,
        actorUserId: input.actorUserId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actionPath: input.actionPath,
        payload: input.payload ?? {},
        occurredAt: input.occurredAt ?? new Date(),
      }),
    );
  }

  /** 사건은 (eventType, referenceType, referenceId)로 유일 — 두 번째 수신자부터는 기존 사건에 붙는다 */
  private async findOrCreateEvent(
    manager: EntityManager,
    input: NotificationEventInput,
  ): Promise<NotificationEventEntity> {
    const existing = await manager
      .getRepository(NotificationEventEntity)
      .findOne({
        where: {
          eventType: input.eventType,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        },
      });
    return existing ?? this.insertEvent(manager, input);
  }

  /** 수신 행 저장 후 SSE로 즉시 발행 */
  private async insertRecipient(
    manager: EntityManager,
    event: NotificationEventEntity,
    recipientUserId: string,
    presentation?: RecipientPresentation,
  ): Promise<void> {
    const recipientRepository = manager.getRepository(
      NotificationRecipientEntity,
    );
    const recipient = await recipientRepository.save(
      recipientRepository.create({
        notificationEventId: event.id,
        recipientUserId,
        isRead: false,
        readAt: null,
        isArchived: false,
        archivedAt: null,
        recipientRole: presentation?.recipientRole ?? null,
        title: presentation?.title ?? null,
        message: presentation?.message ?? null,
        actionPath: presentation?.actionPath ?? null,
        payload: presentation?.payload ?? {},
      }),
    );
    recipient.notificationEvent = event;
    // 방금 발생한 알림은 연결된 업무가 아직 진행 중이므로 처리 필요로 본다
    this.notificationStreamService.publishToUser(
      recipientUserId,
      this.toListItem(recipient, true),
    );
  }

  private async insertOutbox(
    manager: EntityManager,
    event: NotificationEventEntity,
    recipientUserId: string,
    payload: TradePushPayload,
  ): Promise<void> {
    const outboxRepository = manager.getRepository(NotificationOutboxEntity);
    await outboxRepository.save(
      outboxRepository.create({
        notificationEventId: event.id,
        recipientUserId,
        status: NotificationOutboxStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: new Date(),
        lastError: null,
        payload,
      }),
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  /** 가입 제출 → ACTIVE ADMIN/SYS_ADMIN에게 알림. 관리자 0명이면 사건만 생성. */
  async createRegistrationRequestedInTransaction(
    manager: EntityManager,
    params: {
      applicantUserId: string;
      recipientUserIds: string[];
    },
  ): Promise<NotificationEventEntity> {
    const policy = getNotificationPolicy(
      NotificationEventType.USER_REGISTRATION_REQUESTED,
    );
    return this.createEventWithRecipientsInTransaction(manager, {
      eventType: policy.eventType,
      priority: policy.priority,
      title: policy.title,
      message: policy.body,
      actorUserId: params.applicantUserId,
      referenceType: NotificationReferenceType.USER,
      referenceId: params.applicantUserId,
      actionPath: `/admin/users/${params.applicantUserId}/approval`,
      recipientUserIds: params.recipientUserIds,
    });
  }

  /**
   * 승인 결과 → 신청자 수신 행 생성.
   * 신청자는 승인 전 로그인 불가이므로 인앱 API 대상이 아님(후속 채널용).
   */
  async createRegistrationApprovedInTransaction(
    manager: EntityManager,
    params: {
      adminUserId: string;
      applicantUserId: string;
      approvalReviewId: string;
    },
  ): Promise<NotificationEventEntity> {
    const policy = getNotificationPolicy(
      NotificationEventType.USER_REGISTRATION_APPROVED,
    );
    return this.createEventWithRecipientsInTransaction(manager, {
      eventType: policy.eventType,
      priority: policy.priority,
      title: policy.title,
      message: policy.body,
      actorUserId: params.adminUserId,
      referenceType: NotificationReferenceType.USER_APPROVAL_REVIEW,
      referenceId: params.approvalReviewId,
      actionPath: '/home',
      recipientUserIds: [params.applicantUserId],
    });
  }

  /**
   * 반려 결과 → 신청자 수신 행 생성.
   * REJECTED는 로그인 불가이므로 인앱 API 대상이 아님(후속 채널용).
   */
  async createRegistrationRejectedInTransaction(
    manager: EntityManager,
    params: {
      adminUserId: string;
      applicantUserId: string;
      approvalReviewId: string;
    },
  ): Promise<NotificationEventEntity> {
    const policy = getNotificationPolicy(
      NotificationEventType.USER_REGISTRATION_REJECTED,
    );
    return this.createEventWithRecipientsInTransaction(manager, {
      eventType: policy.eventType,
      priority: policy.priority,
      title: policy.title,
      message: policy.body,
      actorUserId: params.adminUserId,
      referenceType: NotificationReferenceType.USER_APPROVAL_REVIEW,
      referenceId: params.approvalReviewId,
      actionPath: '/signup/review-result',
      recipientUserIds: [params.applicantUserId],
    });
  }

  async listForRecipient(
    recipientUserId: string,
    page: number,
    size: number,
    filter: NotificationInboxFilter = NotificationInboxFilter.ALL,
  ): Promise<{ items: NotificationListItem[]; pagination: PaginationMeta }> {
    const qb = this.recipientRepository
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.notificationEvent', 'e')
      .where('r.recipient_user_id = :recipientUserId', { recipientUserId })
      .andWhere('r.is_archived = false');
    if (filter === NotificationInboxFilter.UNREAD) {
      qb.andWhere('r.is_read = false');
    } else if (filter === NotificationInboxFilter.ACTION) {
      qb.andWhere(actionRequiredSql('e'));
    }
    const [rows, totalItems] = await qb
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const requiredEventIds = await this.findActionRequiredEventIds(
      rows
        .filter((row) =>
          ACTIONABLE_NOTIFICATION_TYPES.has(row.notificationEvent.eventType),
        )
        .map((row) => row.notificationEventId),
    );

    return {
      items: rows.map((row) =>
        this.toListItem(row, requiredEventIds.has(row.notificationEventId)),
      ),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async countUnread(recipientUserId: string): Promise<{ count: number }> {
    const count = await this.countUnreadRows(recipientUserId);
    return { count };
  }

  /** 헤더 배지·필터 칩에 쓰는 미읽음 / 확인 필요 건수 */
  async countInbox(recipientUserId: string): Promise<NotificationInboxCounts> {
    const [unreadCount, actionRequiredCount] = await Promise.all([
      this.countUnreadRows(recipientUserId),
      this.recipientRepository
        .createQueryBuilder('r')
        .innerJoin('r.notificationEvent', 'e')
        .where('r.recipient_user_id = :recipientUserId', { recipientUserId })
        .andWhere('r.is_archived = false')
        .andWhere(actionRequiredSql('e'))
        .getCount(),
    ]);
    return { unreadCount, actionRequiredCount };
  }

  private countUnreadRows(recipientUserId: string): Promise<number> {
    return this.recipientRepository.count({
      where: {
        recipientUserId,
        isRead: false,
        isArchived: false,
      },
    });
  }

  private async findActionRequiredEventIds(
    eventIds: string[],
  ): Promise<Set<string>> {
    if (eventIds.length === 0) {
      return new Set();
    }
    const rows = await this.eventRepository
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .where('e.id IN (:...eventIds)', { eventIds })
      .andWhere(actionRequiredSql('e'))
      .getRawMany<{ id: string }>();
    return new Set(rows.map((row) => row.id));
  }

  async markRead(
    recipientUserId: string,
    recipientNotificationId: string,
  ): Promise<void> {
    const recipient = await this.getOwnedRecipient(
      recipientUserId,
      recipientNotificationId,
    );
    if (recipient.isRead) {
      return;
    }
    recipient.isRead = true;
    recipient.readAt = new Date();
    await this.recipientRepository.save(recipient);
  }

  async markAllRead(recipientUserId: string): Promise<void> {
    const unread = await this.recipientRepository.find({
      where: {
        recipientUserId,
        isRead: false,
        isArchived: false,
      },
    });
    if (unread.length === 0) {
      return;
    }
    const now = new Date();
    for (const row of unread) {
      row.isRead = true;
      row.readAt = now;
    }
    await this.recipientRepository.save(unread);
  }

  async archive(
    recipientUserId: string,
    recipientNotificationId: string,
  ): Promise<void> {
    const recipient = await this.getOwnedRecipient(
      recipientUserId,
      recipientNotificationId,
    );
    if (recipient.isArchived) {
      return;
    }
    recipient.isArchived = true;
    recipient.archivedAt = new Date();
    await this.recipientRepository.save(recipient);
  }

  async listOutbox(
    status: NotificationOutboxStatus.FAILED | NotificationOutboxStatus.SKIPPED,
    page: number,
    size: number,
  ): Promise<{ items: NotificationOutboxListItem[]; pagination: PaginationMeta }> {
    const [rows, totalItems] = await this.outboxRepository.findAndCount({
      where: { status },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        notificationEventId: row.notificationEventId,
        recipientUserId: row.recipientUserId,
        status: row.status,
        attemptCount: row.attemptCount,
        lastError: row.lastError,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  private async getOwnedRecipient(
    recipientUserId: string,
    recipientNotificationId: string,
  ): Promise<NotificationRecipientEntity> {
    const recipient = await this.recipientRepository.findOne({
      where: { id: recipientNotificationId },
    });
    if (!recipient) {
      throw NotificationDomainException.notFound();
    }
    if (recipient.recipientUserId !== recipientUserId) {
      throw NotificationDomainException.forbidden();
    }
    return recipient;
  }

  /** actionRequired는 처리 필요 종류(ACTIONABLE)에서만 의미가 있다 */
  private toListItem(
    row: NotificationRecipientEntity,
    actionRequired: boolean,
  ): NotificationListItem {
    const event = row.notificationEvent;
    return {
      recipientNotificationId: row.id,
      isRead: row.isRead,
      readAt: row.readAt,
      createdAt: row.createdAt,
      recipientRole: row.recipientRole ?? null,
      payload: row.payload ?? {},
      actionState: resolveActionState(event.eventType, actionRequired),
      event: {
        id: event.id,
        eventType: event.eventType,
        priority: event.priority,
        title: row.title ?? event.title,
        message: row.message ?? event.message,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        actionPath: row.actionPath ?? event.actionPath,
        occurredAt: event.occurredAt,
      },
    };
  }
}
