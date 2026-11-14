import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from './domain/enums/user-role.enum';
import { AdminOpsSummaryDto } from './dto/admin-ops-summary.dto';
import { UserService } from './user.service';

@ApiTags('admin-ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/ops-summary')
export class AdminOpsSummaryController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '관리자 상단 운영 지표' })
  @ApiOkResponse({ type: AdminOpsSummaryDto })
  getSummary(): Promise<AdminOpsSummaryDto> {
    return this.userService.getAdminOpsSummary();
  }
}
