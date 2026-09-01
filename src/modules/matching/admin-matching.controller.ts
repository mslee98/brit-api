import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AdminAccessService } from '../admins/admin-access.service';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { SearchMatchingAttemptsDto } from './dto/search-matching-attempts.dto';
import { MatchingService } from './matching.service';

@ApiTags('admin-matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/matching-attempts')
export class AdminMatchingController {
  constructor(
    private readonly matchingService: MatchingService,
    private readonly adminAccessService: AdminAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: '매칭 시도 이력 (리더/SYS_ADMIN)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchMatchingAttemptsDto,
  ) {
    await this.adminAccessService.assertIsLeaderOrSysAdmin(user);
    return this.matchingService.listAdminAttempts(query);
  }
}
