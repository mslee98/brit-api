import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationInboxItemResponseDto } from './dto/notification-inbox-item-response.dto';
import { NotificationStreamService } from './notification-stream.service';
import { NotificationService } from './notification.service';

@ApiTags('me-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/notifications')
export class UserNotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationStreamService: NotificationStreamService,
  ) {}

  @Get()
  @ApiOperation({ summary: '내 알림 목록' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    const result = await this.notificationService.listForRecipient(
      user.userId,
      query.page,
      query.size,
    );
    return {
      items: result.items.map((item) =>
        NotificationInboxItemResponseDto.from(item),
      ),
      pagination: result.pagination,
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: '미읽음 알림 개수' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.countUnread(user.userId);
  }

  @Patch('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: '알림 전체 읽음' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notificationService.markAllRead(user.userId);
  }

  @Patch(':recipientNotificationId/read')
  @HttpCode(204)
  @ApiOperation({ summary: '알림 읽음 처리' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recipientNotificationId', ParseUUIDPipe)
    recipientNotificationId: string,
  ): Promise<void> {
    await this.notificationService.markRead(
      user.userId,
      recipientNotificationId,
    );
  }

  @Patch(':recipientNotificationId/archive')
  @HttpCode(204)
  @ApiOperation({ summary: '알림 보관 처리' })
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recipientNotificationId', ParseUUIDPipe)
    recipientNotificationId: string,
  ): Promise<void> {
    await this.notificationService.archive(
      user.userId,
      recipientNotificationId,
    );
  }

  @Sse('stream')
  @ApiOperation({ summary: '알림 실시간 스트림 (SSE)' })
  @ApiProduces('text/event-stream')
  stream(
    @CurrentUser() user: AuthenticatedUser,
  ): Observable<MessageEvent> {
    return this.notificationStreamService.subscribe(user.userId);
  }
}
