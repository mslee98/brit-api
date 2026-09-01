import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AdminManagementService } from './admin-management.service';
import { ActivateAdminDto } from './dto/activate-admin.dto';
import { DeactivateAdminDto } from './dto/deactivate-admin.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { RevokeAdminRoleDto } from './dto/revoke-admin-role.dto';
import { RevokeAdminSessionsDto } from './dto/revoke-admin-sessions.dto';
import { SearchAdminsDto } from './dto/search-admins.dto';
import { UpdateAdminPermissionsDto } from './dto/update-admin-permissions.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { ActiveAdminGuard } from './guards/active-admin.guard';

@ApiTags('admin-admins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/admins')
export class AdminManagementController {
  constructor(
    private readonly adminManagementService: AdminManagementService,
  ) {}

  @Get()
  @ApiOperation({ summary: '관리자 목록' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchAdminsDto,
  ) {
    return this.adminManagementService.search(
      { userId: user.userId, role: user.role },
      query,
    );
  }

  @Get(':adminId')
  @ApiOperation({ summary: '관리자 상세' })
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
  ) {
    return this.adminManagementService.getDetail(
      { userId: user.userId, role: user.role },
      adminId,
    );
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '기존 사용자를 관리자로 등록' })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RegisterAdminDto,
    @Req() req: Request,
  ) {
    return this.adminManagementService.registerAdmin(
      user.userId,
      body,
      resolveClientIp(req),
    );
  }

  @Patch(':adminId/profile')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 프로필 변경' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: UpdateAdminProfileDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.adminManagementService.updateProfile(
      { userId: user.userId, role: user.role },
      adminId,
      body,
      resolveClientIp(req),
    );
  }

  @Put(':adminId/permissions')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 민감 권한 변경' })
  async updatePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: UpdateAdminPermissionsDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.adminManagementService.updatePermissions(
      user.userId,
      adminId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':adminId/deactivate')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 업무 중지' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: DeactivateAdminDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.adminManagementService.deactivate(
      user.userId,
      adminId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':adminId/activate')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 재활성화' })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: ActivateAdminDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.adminManagementService.activate(
      user.userId,
      adminId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':adminId/revoke-role')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 역할 회수' })
  async revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: RevokeAdminRoleDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.adminManagementService.revokeRole(
      user.userId,
      adminId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':adminId/revoke-sessions')
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 세션 강제 종료' })
  revokeSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: RevokeAdminSessionsDto,
    @Req() req: Request,
  ) {
    return this.adminManagementService.revokeSessions(
      user.userId,
      adminId,
      body,
      resolveClientIp(req),
    );
  }
}
