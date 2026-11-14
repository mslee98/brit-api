import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { PartnerClientScopeCode } from './domain/enums/partner-client-scope-code.enum';
import {
  PartnerClientAuthGuard,
  RequirePartnerScopes,
  type PartnerClientAuthRequest,
} from './guards/partner-client-auth.guard';
import { PartnerExchangeService } from './partner-exchange.service';

/**
 * 업체 서버 — 회원 키 기준 BRIT 연결 상태 조회 (샘플·연동 참고용 SoT).
 */
@ApiTags('partner-user-links')
@ApiSecurity('partner-client')
@ApiHeader({ name: 'X-Partner-Client-Id', required: true })
@ApiHeader({ name: 'X-Partner-Api-Secret', required: true })
@UseGuards(PartnerClientAuthGuard)
@RequirePartnerScopes(PartnerClientScopeCode.USER_LINK)
@Controller('partner/user-links')
export class PartnerUserLinksController {
  constructor(
    private readonly partnerExchangeService: PartnerExchangeService,
  ) {}

  @Get(':partnerUserKey')
  @ApiOperation({
    summary:
      '업체 회원 키의 BRIT 연결 상태 (ACTIVE | NONE). UI·충전 전 재확인용',
  })
  get(
    @Req() req: PartnerClientAuthRequest,
    @Param('partnerUserKey') partnerUserKey: string,
  ) {
    return this.partnerExchangeService.getLinkByPartnerUserKey(
      req.partnerId!,
      partnerUserKey,
    );
  }
}
