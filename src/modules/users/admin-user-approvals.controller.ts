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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from './domain/enums/user-role.enum';
import {
  ApproveUserRegistrationDto,
  RejectUserRegistrationDto,
} from './dto/approve-user-registration.dto';
import { UserService } from './user.service';

@ApiTags('admin-user-approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/user-approvals')
export class AdminUserApprovalsController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '가입 승인 대기 목록' })
  listPending(@Query() query: PaginationQueryDto) {
    return this.userService.listPendingApprovals(query.page, query.size);
  }

  @Get(':userId')
  @ApiOperation({ summary: '가입 승인 대기 상세' })
  getDetail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.getApprovalDetail(userId);
  }

  @Post(':userId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: '가입 승인' })
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ApproveUserRegistrationDto,
  ) {
    return this.userService.approveRegistration(admin.userId, userId, body);
  }

  @Post(':userId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '가입 반려' })
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: RejectUserRegistrationDto,
  ) {
    return this.userService.rejectRegistration(admin.userId, userId, body);
  }
}
