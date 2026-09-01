import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import {
  CreateMatchingPolicyDto,
  MatchingPolicyResponseDto,
  SearchMatchingPoliciesDto,
} from './dto/matching-policy.dto';
import { MatchingPolicyService } from './matching-policy.service';

@ApiTags('admin-matching-policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/matching-policies')
export class AdminMatchingPolicyController {
  constructor(
    private readonly matchingPolicyService: MatchingPolicyService,
  ) {}

  @Get('active')
  @ApiOperation({ summary: '현재 활성 매칭 정책' })
  @ApiOkResponse({ type: MatchingPolicyResponseDto })
  getActive(): Promise<MatchingPolicyResponseDto> {
    return this.matchingPolicyService.getActivePolicy();
  }

  @Get()
  @ApiOperation({ summary: '매칭 정책 이력 (리더/SYS_ADMIN)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchMatchingPoliciesDto,
  ) {
    return this.matchingPolicyService.listPolicyHistory(user, query);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '새 매칭 정책 버전 생성 (SYS_ADMIN)' })
  @ApiCreatedResponse({ type: MatchingPolicyResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMatchingPolicyDto,
    @Req() req: Request,
  ): Promise<MatchingPolicyResponseDto> {
    return this.matchingPolicyService.createPolicyVersion(
      user.userId,
      user.role,
      dto,
      resolveClientIp(req),
    );
  }
}
