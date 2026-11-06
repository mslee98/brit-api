import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { NotificationCopyRole } from '../domain/constants/notification.constants';
import { NotificationActionState } from '../domain/enums/notification-action-state.enum';
import { NotificationEventType } from '../domain/enums/notification-event-type.enum';
import { NotificationPriority } from '../domain/enums/notification-priority.enum';
import { NotificationReferenceType } from '../domain/enums/notification-reference-type.enum';
import type { NotificationListItem } from '../notification.service';

export class NotificationInboxItemResponseDto {
  @ApiProperty()
  recipientNotificationId!: string;

  @ApiProperty({ description: 'Wire notificationId (= event id)' })
  notificationId!: string;

  @ApiProperty({ enum: NotificationEventType, description: 'Wire type' })
  type!: NotificationEventType;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Wire body' })
  body!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Wire deepLink' })
  deepLink!: string | null;

  @ApiProperty({ enum: NotificationPriority })
  priority!: NotificationPriority;

  @ApiProperty({ enum: NotificationReferenceType })
  referenceType!: NotificationReferenceType;

  @ApiProperty()
  referenceId!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiPropertyOptional({ nullable: true })
  readAt!: Date | null;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({
    enum: NotificationActionState,
    description: '연결된 업무 기준 처리 필요 여부 (읽음과 별개)',
  })
  actionState!: NotificationActionState;

  @ApiPropertyOptional({ nullable: true, enum: ['BUYER', 'SELLER'] })
  recipientRole!: NotificationCopyRole | null;

  @ApiPropertyOptional({ nullable: true, description: '거래 수량 (발송 시점)' })
  coinAmount!: string | null;

  @ApiPropertyOptional({ nullable: true, description: '상대방 마스킹 닉네임' })
  counterpartyNicknameMasked!: string | null;

  static from(item: NotificationListItem): NotificationInboxItemResponseDto {
    const payload = item.payload;
    return {
      actionState: item.actionState,
      recipientRole: item.recipientRole,
      coinAmount:
        typeof payload.coinAmount === 'string' ? payload.coinAmount : null,
      counterpartyNicknameMasked:
        typeof payload.counterpartyNicknameMasked === 'string'
          ? payload.counterpartyNicknameMasked
          : null,
      recipientNotificationId: item.recipientNotificationId,
      notificationId: item.event.id,
      type: item.event.eventType,
      title: item.event.title,
      body: item.event.message,
      deepLink: item.event.actionPath,
      priority: item.event.priority,
      referenceType: item.event.referenceType,
      referenceId: item.event.referenceId,
      isRead: item.isRead,
      readAt: item.readAt,
      occurredAt: item.event.occurredAt,
      createdAt: item.createdAt,
    };
  }
}
