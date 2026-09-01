import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradeRequestResponseDto } from '../matching/dto/matching-response.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { SearchSellOrdersDto } from './dto/search-orders.dto';
import { SellOrderResponseDto } from './dto/sell-order-response.dto';
import { OrderDomainException } from './exceptions/order.exceptions';
import { SellOrderService } from './sell-order.service';

@ApiTags('sell-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sell-orders')
export class SellOrderController {
  constructor(private readonly sellOrderService: SellOrderService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '판매 주문 생성 (전액 Coin Lock)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: SellOrderResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SellOrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw OrderDomainException.idempotencyKeyRequired();
    }
    return this.sellOrderService.createSellOrder(
      user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Get()
  @ApiOperation({ summary: '내 판매 주문 목록' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchSellOrdersDto,
  ) {
    return this.sellOrderService.listMySellOrders(user.userId, query);
  }

  @Get(':orderId/pending-request')
  @ApiOperation({ summary: '판매 주문에 대기 중인 거래 신청 (없으면 204)' })
  @ApiOkResponse({ type: TradeRequestResponseDto })
  @ApiNoContentResponse({ description: '대기 중인 신청 없음' })
  async getPendingRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TradeRequestResponseDto | void> {
    const pending = await this.sellOrderService.getMySellOrderPendingRequest(
      user.userId,
      orderId,
    );
    if (!pending) {
      res.status(204);
      return;
    }
    return pending;
  }

  @Get(':orderId')
  @ApiOperation({ summary: '내 판매 주문 상세' })
  @ApiOkResponse({ type: SellOrderResponseDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<SellOrderResponseDto> {
    return this.sellOrderService.getMySellOrder(user.userId, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '판매 주문 잔여분 취소 (Unlock)' })
  @ApiOkResponse({ type: SellOrderResponseDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<SellOrderResponseDto> {
    return this.sellOrderService.cancelSellOrder(user.userId, orderId);
  }
}
