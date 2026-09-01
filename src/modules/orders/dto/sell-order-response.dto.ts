import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';
import { SellOrderEntity } from '../infrastructure/entities/sell-order.entity';

export class SellOrderAmountDto {
  @ApiProperty()
  original!: string;

  @ApiProperty()
  remaining!: string;

  @ApiProperty()
  reserved!: string;

  @ApiProperty()
  completed!: string;

  @ApiProperty()
  cancelled!: string;

  @ApiProperty()
  minimumTrade!: string;
}

export class SellOrderPolicyDto {
  @ApiProperty({ description: 'min split ratio percent (bps/100)' })
  minSplitRatio!: number;
}

export class SellOrderCoinAllocationDto {
  @ApiProperty()
  lotId!: string;

  @ApiPropertyOptional()
  sourceType?: string;

  @ApiProperty()
  lockedAmount!: string;

  @ApiProperty()
  consumedAmount!: string;

  @ApiProperty()
  releasedAmount!: string;
}

export class SellOrderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: SellOrderStatus })
  status!: SellOrderStatus;

  @ApiProperty({ type: SellOrderAmountDto })
  amount!: SellOrderAmountDto;

  @ApiProperty({ type: SellOrderPolicyDto })
  policy!: SellOrderPolicyDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ type: [SellOrderCoinAllocationDto] })
  coinAllocations?: SellOrderCoinAllocationDto[];

  static from(
    entity: SellOrderEntity,
    options?: {
      coinAllocations?: SellOrderCoinAllocationDto[];
    },
  ): SellOrderResponseDto {
    return {
      id: entity.id,
      orderNumber: entity.orderNumber,
      status: entity.status,
      amount: {
        original: entity.originalCoinAmount,
        remaining: entity.remainingCoinAmount,
        reserved: entity.reservedCoinAmount,
        completed: entity.completedCoinAmount,
        cancelled: entity.cancelledCoinAmount,
        minimumTrade: entity.minimumTradeAmount,
      },
      policy: {
        minSplitRatio: entity.minSplitRatioBpsSnapshot / 100,
      },
      createdAt: entity.createdAt,
      completedAt: entity.completedAt,
      cancelledAt: entity.cancelledAt,
      coinAllocations: options?.coinAllocations,
    };
  }
}
