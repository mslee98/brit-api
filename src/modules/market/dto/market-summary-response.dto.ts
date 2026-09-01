import { ApiProperty } from '@nestjs/swagger';

export class MarketSummaryResponseDto {
  @ApiProperty({ description: '거래 가능한 판매 주문 수' })
  availableSellOrderCount!: number;

  @ApiProperty({
    description: '거래 가능한 총 Coin 수량 (bigint → string)',
    example: '32450000',
  })
  availableCoinAmount!: string;
}
