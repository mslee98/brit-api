import { ApiProperty } from '@nestjs/swagger';

import type { PaginationMeta } from '../../../common/dto/pagination-query.dto';

export class MarketSellerDto {
  @ApiProperty({ description: '마스킹된 판매자 닉네임 (예: 민**)', example: '민**' })
  nickname!: string;
}

export class MarketSellOrderItemDto {
  @ApiProperty()
  sellOrderId!: string;

  @ApiProperty({ type: MarketSellerDto })
  seller!: MarketSellerDto;

  @ApiProperty({
    description: '현재 거래 가능한 잔여 Coin 수량 (bigint → string)',
    example: '500000',
  })
  remainingCoinAmount!: string;

  @ApiProperty({
    description: '최소 거래 단위 (bigint → string)',
    example: '100000',
  })
  minimumTradeAmount!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class MarketSellOrderListResponseDto {
  @ApiProperty({ type: [MarketSellOrderItemDto] })
  items!: MarketSellOrderItemDto[];

  @ApiProperty()
  pagination!: PaginationMeta;
}
