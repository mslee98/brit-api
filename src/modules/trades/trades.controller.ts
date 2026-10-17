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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CancelTradeDto,
  CancellationRequestDto,
} from './dto/cancel-trade.dto';
import { OpenTradeDisputeDto } from './dto/admin-trade-command.dto';
import { SearchMyTradesDto } from './dto/search-trades.dto';
import { TradeResponseDto } from './dto/trade-response.dto';
import { TradeService } from './trade.service';

@ApiTags('trades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trades')
export class TradesController {
  constructor(private readonly tradeService: TradeService) {}

  @Get()
  @ApiOperation({ summary: '내 거래 목록' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchMyTradesDto,
  ) {
    return this.tradeService.listMyTrades(user.userId, query);
  }

  @Get(':tradeId')
  @ApiOperation({ summary: '거래 상세 (당사자)' })
  @ApiOkResponse({ type: TradeResponseDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.getMyTrade(user.userId, tradeId);
  }

  @Post(':tradeId/payment-report')
  @HttpCode(200)
  @ApiOperation({ summary: '구매자 입금 완료 선언' })
  @ApiOkResponse({ type: TradeResponseDto })
  reportPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.reportPayment(user.userId, tradeId);
  }

  @Post(':tradeId/withdraw-payment-report')
  @HttpCode(200)
  @ApiOperation({ summary: '구매자 입금 신고 철회 (10분·판매자 미확인)' })
  @ApiOkResponse({ type: TradeResponseDto })
  withdrawPaymentReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.withdrawPaymentReport(user.userId, tradeId);
  }

  @Post(':tradeId/confirm-payment')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 입금 확인' })
  @ApiOkResponse({ type: TradeResponseDto })
  confirmPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.confirmPayment(user.userId, tradeId);
  }

  @Post(':tradeId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '입금 전 거래 취소' })
  @ApiOkResponse({ type: TradeResponseDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
    @Body() dto: CancelTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.cancelTrade(user.userId, tradeId, dto.reason);
  }

  @Post(':tradeId/cancellation-request')
  @HttpCode(200)
  @ApiOperation({ summary: '입금 후 쌍방취소 요청' })
  @ApiOkResponse({ type: TradeResponseDto })
  requestCancellation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
    @Body() dto: CancellationRequestDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.requestCancellation(
      user.userId,
      tradeId,
      dto.reason,
    );
  }

  @Post(':tradeId/cancellation-agreement')
  @HttpCode(200)
  @ApiOperation({ summary: '쌍방취소 동의' })
  @ApiOkResponse({ type: TradeResponseDto })
  agreeCancellation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.agreeCancellation(user.userId, tradeId);
  }

  @Post(':tradeId/refund-report')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 현금 반환 선언' })
  @ApiOkResponse({ type: TradeResponseDto })
  reportRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.reportRefund(user.userId, tradeId);
  }

  @Post(':tradeId/refund-confirm')
  @HttpCode(200)
  @ApiOperation({ summary: '구매자 환수 확인 후 거래 취소' })
  @ApiOkResponse({ type: TradeResponseDto })
  confirmRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.confirmRefund(user.userId, tradeId);
  }

  @Post(':tradeId/mark-unpaid')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 미입금 확정 (PAYMENT_TIMEOUT)' })
  @ApiOkResponse({ type: TradeResponseDto })
  markUnpaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.markUnpaid(user.userId, tradeId);
  }

  @Post(':tradeId/deny-payment')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 입금 미수신 → 분쟁' })
  @ApiOkResponse({ type: TradeResponseDto })
  denyPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.denyPayment(user.userId, tradeId);
  }

  @Post(':tradeId/disputes')
  @HttpCode(200)
  @ApiOperation({ summary: '구매자 분쟁 제기' })
  @ApiOkResponse({ type: TradeResponseDto })
  openDispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
    @Body() dto: OpenTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.openPartyDispute(
      user.userId,
      tradeId,
      dto.reason,
    );
  }
}
