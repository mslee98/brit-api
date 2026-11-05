import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { PartnerClientScopeCode } from './domain/enums/partner-client-scope-code.enum';
import { PartnerExchangeRequestDto } from './dto/partner-exchange-request.dto';
import {
  PartnerClientAuthGuard,
  RequirePartnerScopes,
  type PartnerClientAuthRequest,
} from './guards/partner-client-auth.guard';
import { PartnerExchangeService } from './partner-exchange.service';

@ApiTags('partner-exchanges')
@ApiSecurity('partner-client')
@ApiHeader({ name: 'X-Partner-Client-Id', required: true })
@ApiHeader({ name: 'X-Partner-Api-Secret', required: true })
@UseGuards(PartnerClientAuthGuard)
@Controller('partner/exchanges')
export class PartnerExchangesController {
  constructor(
    private readonly partnerExchangeService: PartnerExchangeService,
  ) {}

  @Post('charge')
  @HttpCode(201)
  @RequirePartnerScopes(PartnerClientScopeCode.EXCHANGE_CHARGE)
  @ApiOperation({
    summary: 'CHARGE (Sandbox 동기) — 사용자 MS → 업체 잔액',
  })
  charge(
    @Req() req: PartnerClientAuthRequest,
    @Body() body: PartnerExchangeRequestDto,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    const dto = {
      ...body,
      idempotencyKey: idempotencyHeader?.trim() || body.idempotencyKey,
    };
    return this.partnerExchangeService.charge(
      req.partnerId!,
      req.partnerClientId!,
      dto,
    );
  }

  @Post('redeem')
  @HttpCode(201)
  @RequirePartnerScopes(PartnerClientScopeCode.EXCHANGE_REDEEM)
  @ApiOperation({
    summary: 'REDEEM (Sandbox 동기) — 업체 잔액 → 사용자 sellable MS',
  })
  redeem(
    @Req() req: PartnerClientAuthRequest,
    @Body() body: PartnerExchangeRequestDto,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    const dto = {
      ...body,
      idempotencyKey: idempotencyHeader?.trim() || body.idempotencyKey,
    };
    return this.partnerExchangeService.redeem(
      req.partnerId!,
      req.partnerClientId!,
      dto,
    );
  }
}
