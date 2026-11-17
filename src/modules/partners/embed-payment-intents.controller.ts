import {
  Body,
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
import {
  AuthorizePartnerPaymentIntentDto,
  LockPartnerPaymentIntentAmountDto,
} from './dto/partner-payment-intent.dto';
import { PartnerPaymentIntentsService } from './partner-payment-intents.service';

/**
 * BRIT 충전 팝업(brit-front /embed-pay.html)에서 로그인한 사용자가 호출한다.
 */
@ApiTags('embed-payment-intents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('embed/intents')
export class EmbedPaymentIntentsController {
  constructor(
    private readonly paymentIntentsService: PartnerPaymentIntentsService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'B3/D26 — Embed 충전 요청 조회 (잔액·needsAmount·승인 가능 여부)',
  })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentIntentsService.getForEmbed(id, user.userId);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'B3 — Embed Intent 상태' })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentIntentsService.statusForEmbed(id, user.userId);
  }

  @Post(':id/lock')
  @HttpCode(200)
  @ApiOperation({
    summary: 'D26 — Embed에서 CHARGE 금액 확정 (잔액 확인 후 lock)',
  })
  lock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LockPartnerPaymentIntentAmountDto,
  ) {
    return this.paymentIntentsService.lockAmount(id, user.userId, body);
  }

  @Post(':id/authorize')
  @HttpCode(200)
  @ApiOperation({ summary: 'B3 — 거래 PIN으로 CHARGE 승인 · 동기 전환' })
  authorize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AuthorizePartnerPaymentIntentDto,
  ) {
    return this.paymentIntentsService.authorize(id, user.userId, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'B3 — PIN 승인 전 Intent 취소' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentIntentsService.cancel(id, user.userId);
  }
}
