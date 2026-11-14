import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PartnerExchangeService } from './partner-exchange.service';

/**
 * B2 — 로그인한 BRIT 사용자의 업체 연결 목록·해제.
 */
@ApiTags('me-partner-links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/partner-links')
export class MePartnerLinksController {
  constructor(private readonly partnerExchangeService: PartnerExchangeService) {}

  @Get()
  @ApiOperation({ summary: '내 업체 연결 목록 (ACTIVE)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.partnerExchangeService.listLinksForUser(user.userId);
  }

  @Post(':linkId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: '내 업체 연결 해제' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    return this.partnerExchangeService.unlinkForUser(user.userId, linkId);
  }
}
