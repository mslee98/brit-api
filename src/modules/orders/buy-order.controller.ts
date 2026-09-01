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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApplyBuyOrderResponseDto,
  MatchBuyOrderDto,
  MatchBuyOrderResponseDto,
  MatchingCandidatesResponseDto,
  MatchingStatusResponseDto,
  SearchMatchingCandidatesDto,
} from '../matching/dto/matching-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuyOrderService } from './buy-order.service';
import { BuyOrderResponseDto } from './dto/buy-order-response.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { SearchBuyOrdersDto } from './dto/search-orders.dto';
import { OrderDomainException } from './exceptions/order.exceptions';

@ApiTags('buy-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('buy-orders')
export class BuyOrderController {
  constructor(private readonly buyOrderService: BuyOrderService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '구매 탐색 세션 생성 (MATCHING)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: BuyOrderResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BuyOrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw OrderDomainException.idempotencyKeyRequired();
    }
    return this.buyOrderService.createBuyOrder(
      user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Get()
  @ApiOperation({ summary: '내 구매 주문 목록' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchBuyOrdersDto,
  ) {
    return this.buyOrderService.listMyBuyOrders(user.userId, query);
  }

  @Get(':orderId/matching-status')
  @ApiOperation({ summary: '구매 주문 매칭 상태 (복구/재진입)' })
  @ApiOkResponse({ type: MatchingStatusResponseDto })
  matchingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<MatchingStatusResponseDto> {
    return this.buyOrderService.getMatchingStatus(user.userId, orderId);
  }

  @Get(':orderId/candidates')
  @ApiOperation({ summary: 'Exact/Near 판매 후보 조회' })
  @ApiOkResponse({ type: MatchingCandidatesResponseDto })
  candidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query() query: SearchMatchingCandidatesDto,
  ): Promise<MatchingCandidatesResponseDto> {
    return this.buyOrderService.listCandidates(user.userId, orderId, query);
  }

  @Post(':orderId/match')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 선택 및 Trade 생성' })
  @ApiOkResponse({ type: MatchBuyOrderResponseDto })
  match(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MatchBuyOrderDto,
  ): Promise<MatchBuyOrderResponseDto> {
    return this.buyOrderService.selectMatch(user.userId, orderId, dto);
  }

  @Post(':orderId/apply')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 선택 신청 (TradeRequest, 물량 선점)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ApplyBuyOrderResponseDto })
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MatchBuyOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApplyBuyOrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw OrderDomainException.idempotencyKeyRequired();
    }
    return this.buyOrderService.applyToSellOrder(
      user.userId,
      orderId,
      dto,
      idempotencyKey,
    );
  }

  @Get(':orderId')
  @ApiOperation({ summary: '내 구매 주문 상세' })
  @ApiOkResponse({ type: BuyOrderResponseDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<BuyOrderResponseDto> {
    return this.buyOrderService.getMyBuyOrder(user.userId, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '구매 탐색 취소 (MATCHING만)' })
  @ApiOkResponse({ type: BuyOrderResponseDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<BuyOrderResponseDto> {
    return this.buyOrderService.cancelBuyOrder(user.userId, orderId);
  }
}
