import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('admin-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '관리자 알림 목록' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notificationService.listForRecipient(
      user.userId,
      query.page,
      query.size,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: '관리자 미읽음 알림 개수' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.countUnread(user.userId);
  }

  @Patch('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: '알림 전체 읽음 처리' })
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
}
