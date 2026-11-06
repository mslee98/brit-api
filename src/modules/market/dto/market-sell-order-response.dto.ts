import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { PaginationMeta } from '../../../common/dto/pagination-query.dto';

export class MarketSellerDto {
  @ApiProperty({ description: '마스킹된 판매자 닉네임 (예: 민**)', example: '민**' })
  nickname!: string;

  @ApiProperty({
    description: '판매자 역할로 COMPLETED된 거래 수',
    example: 12,
  })
  completedTradeCount!: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      '0~100. floor(completed / (completed + 판매자 귀책 취소) * 100). 판매자 귀책 취소 = 입금 전 판매자 취소. 구매자 취소·미입금·합의·분쟁 강제 취소는 제외. 분모 0이면 null',
    example: 98,
  })
  completionRatePct!: number | null;

  @ApiProperty({
    description:
      '판매자 귀책 분쟁 수(철회 제외). SELLER_NO_CONFIRM·SELLER_CONFIRMATION_TIMEOUT(강제 취소 판정 제외) + 판매자가 연 NOT_RECEIVED 중 강제 완료 판정',
    example: 0,
  })
  disputeCount!: number;

  @ApiProperty({
    description: '종료 거래(완료+취소)가 없으면 true (신규 판매자 배지용)',
    example: false,
  })
  isNewSeller!: boolean;
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
