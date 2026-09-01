import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NotificationOutboxStatus } from '../domain/enums/notification-outbox-status.enum';

export class SearchNotificationOutboxDto extends PaginationQueryDto {
  @ApiProperty({ enum: [NotificationOutboxStatus.FAILED, NotificationOutboxStatus.SKIPPED] })
  @IsEnum(NotificationOutboxStatus)
  status!: NotificationOutboxStatus.FAILED | NotificationOutboxStatus.SKIPPED;
}
