import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PartnerLinkApprovalActionDto } from './dto/partner-link-session.dto';
import { PartnerLinkSessionsService } from './partner-link-sessions.service';

/**
 * BRIT 앱·웹에서 연결 코드를 입력하거나 알림에서 승인/거절한다 (MC-P9).
 */
@ApiTags('me-partner-link-approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/partner-link-approvals')
export class MePartnerLinkApprovalsController {
  constructor(private readonly linkSessionsService: PartnerLinkSessionsService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary: '연결 미리보기 (pairingCode 또는 sessionId, claim된 본인만)',
  })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PartnerLinkApprovalActionDto,
  ) {
    return this.linkSessionsService.previewApproval(user.userId, body);
  }

  @Post('approve')
  @HttpCode(200)
  @ApiOperation({ summary: '연결 승인 (pairingCode 또는 sessionId)' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PartnerLinkApprovalActionDto,
  ) {
    return this.linkSessionsService.approveByClient(user.userId, body);
  }

  @Post('reject')
  @HttpCode(200)
  @ApiOperation({ summary: '연결 거절 (pairingCode 또는 sessionId)' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PartnerLinkApprovalActionDto,
  ) {
    return this.linkSessionsService.rejectByClient(user.userId, body);
  }
}
