import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { PartnerClientScopeCode } from './domain/enums/partner-client-scope-code.enum';
import {
  CreatePartnerLinkSessionDto,
  ExchangePartnerLinkCodeDto,
} from './dto/partner-link-session.dto';
import {
  PartnerClientAuthGuard,
  RequirePartnerScopes,
  type PartnerClientAuthRequest,
} from './guards/partner-client-auth.guard';
import { PartnerLinkSessionsService } from './partner-link-sessions.service';

@ApiTags('partner-link-sessions')
@ApiSecurity('partner-client')
@ApiHeader({ name: 'X-Partner-Client-Id', required: true })
@ApiHeader({ name: 'X-Partner-Api-Secret', required: true })
@UseGuards(PartnerClientAuthGuard)
@RequirePartnerScopes(PartnerClientScopeCode.USER_LINK)
@Controller('partner/link-sessions')
export class PartnerLinkSessionsController {
  constructor(private readonly linkSessionsService: PartnerLinkSessionsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: '계정 연결 세션 생성 — 팝업 linkUrl 발급 (3분, 1회용). pairingCode 미포함',
  })
  create(
    @Req() req: PartnerClientAuthRequest,
    @Body() body: CreatePartnerLinkSessionDto,
  ) {
    return this.linkSessionsService.createSession(
      req.partnerId!,
      req.partnerClientId!,
      body,
    );
  }

  @Post('exchange')
  @HttpCode(200)
  @ApiOperation({ summary: '동의 code 교환 — 연결 확정 확인 (5분, 1회용)' })
  exchange(
    @Req() req: PartnerClientAuthRequest,
    @Body() body: ExchangePartnerLinkCodeDto,
  ) {
    return this.linkSessionsService.exchange(req.partnerId!, body.code);
  }
}
