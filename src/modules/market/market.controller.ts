import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketSellOrderQueryDto } from './dto/market-sell-order-query.dto';
import {
  MarketSellOrderListResponseDto,
  MarketSellerDto,
} from './dto/market-sell-order-response.dto';
import { MarketSummaryResponseDto } from './dto/market-summary-response.dto';
import { MarketService } from './market.service';

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('summary')
  @ApiOperation({
    summary: '거래소 현황 요약',
    description: '현재 거래 가능한 판매 주문 수와 총 Coin 수량을 반환합니다.',
  })
  @ApiOkResponse({ type: MarketSummaryResponseDto })
  getSummary(): Promise<MarketSummaryResponseDto> {
    return this.marketService.getSummary();
  }

  @Get('sell-orders')
  @ApiOperation({
    summary: '거래소 판매 주문 목록',
    description:
      'OPEN 또는 PARTIALLY_MATCHED 상태이며 잔여 수량이 있는 판매 주문 목록을 반환합니다. ' +
      '판매자 식별 정보는 마스킹 처리됩니다.',
  })
  @ApiOkResponse({ type: MarketSellOrderListResponseDto })
  listSellOrders(
    @Query() query: MarketSellOrderQueryDto,
  ): Promise<MarketSellOrderListResponseDto> {
    return this.marketService.listSellOrders(query);
  }

  @Get('sellers/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '거래소에 보이는 내 판매자 정보',
    description:
      '구매자가 거래소 카드에서 보는 것과 같은 값(마스킹 닉네임·완료 거래·완료율·분쟁)을 반환합니다.',
  })
  @ApiOkResponse({ type: MarketSellerDto })
  getMySellerProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarketSellerDto> {
    return this.marketService.getMySellerProfile(user.userId);
  }
}
