import { ApiProperty } from '@nestjs/swagger';

export class NotificationInboxCountsResponseDto {
  @ApiProperty({ description: '안 읽은 알림 수' })
  unreadCount!: number;

  @ApiProperty({
    description: '지금 처리가 필요한 알림 수 (actionState = REQUIRED)',
  })
  actionRequiredCount!: number;
}
