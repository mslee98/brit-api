import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NotificationInboxFilter } from '../domain/enums/notification-inbox-filter.enum';

export class SearchNotificationDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: NotificationInboxFilter,
    default: NotificationInboxFilter.ALL,
    description: 'unread=안 읽음, action=지금 처리 필요',
  })
  @IsOptional()
  @IsEnum(NotificationInboxFilter)
  filter: NotificationInboxFilter = NotificationInboxFilter.ALL;
}
