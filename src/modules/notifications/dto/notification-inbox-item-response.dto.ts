import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  static from(item: NotificationListItem): NotificationInboxItemResponseDto {
    return {
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
