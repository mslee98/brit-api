import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationOutboxStatus } from '../domain/enums/notification-outbox-status.enum';
import type { NotificationOutboxListItem } from '../notification.service';

export class NotificationOutboxItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  notificationEventId!: string;

  @ApiProperty()
  recipientUserId!: string;

  @ApiProperty({ enum: NotificationOutboxStatus })
  status!: NotificationOutboxStatus;

  @ApiProperty()
  attemptCount!: number;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(item: NotificationOutboxListItem): NotificationOutboxItemResponseDto {
    return {
      id: item.id,
      notificationEventId: item.notificationEventId,
      recipientUserId: item.recipientUserId,
      status: item.status,
      attemptCount: item.attemptCount,
      lastError: item.lastError,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
