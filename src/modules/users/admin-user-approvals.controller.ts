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
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from './domain/enums/user-role.enum';
import {
  ApproveUserRegistrationDto,
  RejectUserRegistrationDto,
} from './dto/approve-user-registration.dto';
import { SearchRegistrationReviewsDto } from './dto/search-registration-reviews.dto';
import { UserService } from './user.service';

@ApiTags('admin-registration-reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/registration-reviews')
export class AdminUserApprovalsController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '가입 심사 목록' })
  listPending(@Query() query: SearchRegistrationReviewsDto) {
    return this.userService.listRegistrationReviews(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: '가입 심사 상세' })
  getDetail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.getRegistrationReviewDetail(userId);
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
