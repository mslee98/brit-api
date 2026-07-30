import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from './domain/enums/user-role.enum';
import { SearchAdminUsersDto } from './dto/search-admin-users.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { WithdrawUserDto } from './dto/withdraw-user.dto';
import { UserService } from './user.service';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '관리자 사용자 목록·검색' })
  search(@Query() query: SearchAdminUsersDto) {
    return this.userService.searchUsers(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: '관리자 사용자 상세' })
  getDetail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.getAdminUserDetail(userId);
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: '사용자 이용 정지 (세션 일괄 revoke)' })
  suspend(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SuspendUserDto,
  ) {
    return this.userService.suspendUser(admin.userId, userId, body.reason);
  }

  @Post(':userId/unsuspend')
  @HttpCode(204)
  @ApiOperation({ summary: '사용자 이용 정지 해제' })
  async unsuspend(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.userService.unsuspendUser(admin.userId, userId);
  }

  @Post(':userId/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: '사용자 강제 탈퇴 (상태만, 세션 revoke)' })
  withdraw(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: WithdrawUserDto,
  ) {
    return this.userService.withdrawUser(admin.userId, userId, body.reason);
  }
}
