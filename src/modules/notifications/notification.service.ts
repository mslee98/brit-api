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
import { NotificationEventType } from './domain/enums/notification-event-type.enum';
import { NotificationOutboxStatus } from './domain/enums/notification-outbox-status.enum';
import { NotificationPriority } from './domain/enums/notification-priority.enum';
import { NotificationReferenceType } from './domain/enums/notification-reference-type.enum';
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
  tradeId?: string;
  sellOrderId?: string;
  buyOrderId?: string;
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

export type NotificationListItem = {
  recipientNotificationId: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
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
    const eventRepository = manager.getRepository(NotificationEventEntity);
    const recipientRepository = manager.getRepository(
      NotificationRecipientEntity,
    );

    const event = eventRepository.create({
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
    });
    await eventRepository.save(event);

    const uniqueRecipientIds = [...new Set(input.recipientUserIds)];
    if (uniqueRecipientIds.length > 0) {
      const recipients = uniqueRecipientIds.map((recipientUserId) =>
        recipientRepository.create({
          notificationEventId: event.id,
          recipientUserId,
          isRead: false,
          readAt: null,
          isArchived: false,
          archivedAt: null,
        }),
      );
      const saved = await recipientRepository.save(recipients);
      for (const row of saved) {
        row.notificationEvent = event;
        this.notificationStreamService.publishToUser(
          row.recipientUserId,
          this.toListItem(row),
        );
      }
    }

    return event;
  }

  /**
   * 거래 푸시: 같은 업무 TX의 savepoint에서 event + outbox INSERT.
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

    try {
      await manager.transaction(async (inner) => {
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
        const payload = buildTradePushPayload({
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
        });
        const outboxRepository = inner.getRepository(NotificationOutboxEntity);
        await outboxRepository.save(
          outboxRepository.create({
            notificationEventId: event.id,
            recipientUserId: input.recipientUserId,
            status: NotificationOutboxStatus.PENDING,
            attemptCount: 0,
            nextAttemptAt: new Date(),
            lastError: null,
            payload,
          }),
        );
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return;
      }
      this.logger.warn(
        `trade push enqueue failed type=${input.eventType} ref=${input.referenceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
      const payload: TradePushPayload = buildTradePushPayload({
        notificationId: event.id,
        eventType: NotificationEventType.TRADE_COMPLETED,
        title,
        body,
        deepLink: '/',
        referenceType: NotificationReferenceType.USER,
        referenceId,
      });
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
    });

    return { queued: true, referenceId };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
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

    try {
      await manager.transaction(async (inner) => {
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
        const payload = buildTradePushPayload({
          notificationId: event.id,
          eventType: input.eventType,
          title: copy.title,
          body: copy.body,
          deepLink: input.deepLink,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        });
        const outboxRepository = inner.getRepository(NotificationOutboxEntity);
        await outboxRepository.save(
          outboxRepository.create({
            notificationEventId: event.id,
            recipientUserId: input.recipientUserId,
            status: NotificationOutboxStatus.PENDING,
            attemptCount: 0,
            nextAttemptAt: new Date(),
            lastError: null,
            payload,
          }),
        );
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return;
      }
      this.logger.warn(
        `registration push enqueue failed type=${input.eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
  ): Promise<{ items: NotificationListItem[]; pagination: PaginationMeta }> {
    const [rows, totalItems] = await this.recipientRepository.findAndCount({
      where: {
        recipientUserId,
        isArchived: false,
      },
      relations: { notificationEvent: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => this.toListItem(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async countUnread(recipientUserId: string): Promise<{ count: number }> {
    const count = await this.recipientRepository.count({
      where: {
        recipientUserId,
        isRead: false,
        isArchived: false,
      },
    });
    return { count };
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

  private toListItem(
    row: NotificationRecipientEntity,
  ): NotificationListItem {
    const event = row.notificationEvent;
    return {
      recipientNotificationId: row.id,
      isRead: row.isRead,
      readAt: row.readAt,
      createdAt: row.createdAt,
      event: {
        id: event.id,
        eventType: event.eventType,
        priority: event.priority,
        title: event.title,
        message: event.message,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        actionPath: event.actionPath,
        occurredAt: event.occurredAt,
      },
    };
  }
}
