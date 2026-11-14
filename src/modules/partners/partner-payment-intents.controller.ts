import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { PartnerClientScopeCode } from './domain/enums/partner-client-scope-code.enum';
import { CreatePartnerPaymentIntentDto } from './dto/partner-payment-intent.dto';
import {
  PartnerClientAuthGuard,
  RequirePartnerScopes,
  type PartnerClientAuthRequest,
} from './guards/partner-client-auth.guard';
import { PartnerPaymentIntentsService } from './partner-payment-intents.service';

@ApiTags('partner-payment-intents')
@ApiSecurity('partner-client')
@ApiHeader({ name: 'X-Partner-Client-Id', required: true })
@ApiHeader({ name: 'X-Partner-Api-Secret', required: true })
@UseGuards(PartnerClientAuthGuard)
@RequirePartnerScopes(PartnerClientScopeCode.EXCHANGE_CHARGE)
@Controller('partner/payments/intents')
export class PartnerPaymentIntentsController {
  constructor(
    private readonly paymentIntentsService: PartnerPaymentIntentsService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'B3 — CHARGE Intent 생성 · Embed payUrl 발급 (PIN 승인용)',
  })
  create(
    @Req() req: PartnerClientAuthRequest,
    @Body() body: CreatePartnerPaymentIntentDto,
  ) {
    return this.paymentIntentsService.create(
      req.partnerId!,
      req.partnerClientId!,
      body,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'B3 — Intent 상태 조회 (업체 서버)' })
  get(
    @Req() req: PartnerClientAuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentIntentsService.getForPartner(req.partnerId!, id);
  }
}
