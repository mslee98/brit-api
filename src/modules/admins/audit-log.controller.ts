import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import {
  AuditLogDetailDto,
  AuditLogListResponseDto,
} from './dto/audit-log-response.dto';
import { SearchAuditLogsDto } from './dto/search-audit-logs.dto';
import { AdminDomainException } from './exceptions/admin.exceptions';
import { ActiveAdminGuard } from './guards/active-admin.guard';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';

@ApiTags('admin-audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
  ) {}

  @Get()
  @ApiOperation({ summary: '감사 로그 목록' })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchAuditLogsDto,
  ): Promise<AuditLogListResponseDto> {
    await this.assertCanViewAudit(user);
    return this.auditLogService.search(query);
  }

  @Get(':auditLogId')
  @ApiOperation({ summary: '감사 로그 상세' })
  @ApiOkResponse({ type: AuditLogDetailDto })
  async getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('auditLogId', ParseUUIDPipe) auditLogId: string,
  ): Promise<AuditLogDetailDto> {
    await this.assertCanViewAudit(user);
    return this.auditLogService.getDetail(auditLogId);
  }

  private async assertCanViewAudit(user: AuthenticatedUser): Promise<void> {
    if (user.role === UserRole.SYS_ADMIN) {
      return;
    }
    const profile = await this.adminProfileRepository.findOne({
      where: { userId: user.userId },
    });
    if (!profile?.isLeader) {
      throw AdminDomainException.forbidden();
    }
  }
}
