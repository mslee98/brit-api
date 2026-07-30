import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { NotificationEventType } from './domain/enums/notification-event-type.enum';
import { NotificationPriority } from './domain/enums/notification-priority.enum';
import { NotificationReferenceType } from './domain/enums/notification-reference-type.enum';
import { NotificationDomainException } from './exceptions/notification.exceptions';
import { NotificationEventEntity } from './infrastructure/entities/notification-event.entity';
import { NotificationRecipientEntity } from './infrastructure/entities/notification-recipient.entity';

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

/**
 * 알림 사건·수신 관리.
 *
 * 가입 요청(USER_REGISTRATION_REQUESTED)은 관리자 수신이 1차 범위.
 * APPROVED/REJECTED 신청자 수신 행은 저장하나, 미로그인 상태에서는
 * 인앱 조회 불가 — 후속 SMS 등 채널용.
 */
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEventEntity)
    private readonly eventRepository: Repository<NotificationEventEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipientRepository: Repository<NotificationRecipientEntity>,
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
      await recipientRepository.save(recipients);
    }

    return event;
  }

  /** 가입 제출 → ACTIVE ADMIN/SYS_ADMIN에게 알림. 관리자 0명이면 사건만 생성. */
  async createRegistrationRequestedInTransaction(
    manager: EntityManager,
    params: {
      applicantUserId: string;
      recipientUserIds: string[];
    },
  ): Promise<NotificationEventEntity> {
    return this.createEventWithRecipientsInTransaction(manager, {
      eventType: NotificationEventType.USER_REGISTRATION_REQUESTED,
      priority: NotificationPriority.NORMAL,
      title: '신규 가입 승인 요청',
      message: '신규 사용자의 가입 정보 검토가 필요합니다.',
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
    return this.createEventWithRecipientsInTransaction(manager, {
      eventType: NotificationEventType.USER_REGISTRATION_APPROVED,
      priority: NotificationPriority.NORMAL,
      title: '가입 승인이 완료되었습니다',
      message: '관리자 검토가 완료되어 서비스를 이용할 수 있습니다.',
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
    return this.createEventWithRecipientsInTransaction(manager, {
      eventType: NotificationEventType.USER_REGISTRATION_REJECTED,
      priority: NotificationPriority.NORMAL,
      title: '가입 신청 검토 결과',
      message: '가입 신청이 반려되었습니다. 반려 사유를 확인해 주세요.',
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
