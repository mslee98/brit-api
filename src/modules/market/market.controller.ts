import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MarketSellOrderQueryDto } from './dto/market-sell-order-query.dto';
import {
  MarketSellOrderListResponseDto,
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
}
