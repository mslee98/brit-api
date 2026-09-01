import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationOutboxItemResponseDto } from './dto/notification-outbox-item-response.dto';
import { SearchNotificationOutboxDto } from './dto/search-notification-outbox.dto';
import { NotificationService } from './notification.service';

@ApiTags('admin-notification-outbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/notification-outbox')
export class AdminNotificationOutboxController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '알림 outbox FAILED/SKIPPED 목록' })
  async list(@Query() query: SearchNotificationOutboxDto) {
    const result = await this.notificationService.listOutbox(
      query.status,
      query.page,
      query.size,
    );
    return {
      items: result.items.map((item) =>
        NotificationOutboxItemResponseDto.from(item),
      ),
      pagination: result.pagination,
    };
  }
}
