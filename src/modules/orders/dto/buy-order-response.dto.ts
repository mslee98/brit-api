import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { BuyMatchType } from '../domain/enums/buy-match-type.enum';
import { BuyOrderStatus } from '../domain/enums/buy-order-status.enum';
import { BuyOrderEntity } from '../infrastructure/entities/buy-order.entity';

export class BuyOrderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ description: '요청 Coin (bigint string)' })
  coinAmount!: string;

  @ApiPropertyOptional({
    description: '실제 매칭 Coin (bigint string)',
    nullable: true,
  })
  matchedCoinAmount!: string | null;

  @ApiPropertyOptional({ enum: BuyMatchType, nullable: true })
  matchType!: BuyMatchType | null;

  @ApiProperty({ enum: BuyOrderStatus })
  status!: BuyOrderStatus;

  @ApiProperty()
  rematchCount!: number;

  @ApiPropertyOptional({ nullable: true })
  nextMatchableAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  matchedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  static from(entity: BuyOrderEntity): BuyOrderResponseDto {
    return {
      id: entity.id,
      orderNumber: entity.orderNumber,
      coinAmount: entity.coinAmount,
      matchedCoinAmount: entity.matchedCoinAmount,
      matchType: entity.matchType,
      status: entity.status,
      rematchCount: entity.rematchCount,
      nextMatchableAt: entity.nextMatchableAt,
      createdAt: entity.createdAt,
      matchedAt: entity.matchedAt,
      completedAt: entity.completedAt,
      cancelledAt: entity.cancelledAt,
    };
  }
}
