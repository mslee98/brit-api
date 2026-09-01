import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { DateRangeQueryDto } from '../../../common/dto/date-range-query.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AdminPartyDto } from '../../users/dto/admin-party.dto';
import { BuyOrderStatus } from '../domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';

export class SearchAdminBuyOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buyerUserId?: string;

  @ApiPropertyOptional({ enum: BuyOrderStatus })
  @IsOptional()
  @IsEnum(BuyOrderStatus)
  status?: BuyOrderStatus;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

export class SearchAdminSellOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellerUserId?: string;

  @ApiPropertyOptional({ enum: SellOrderStatus })
  @IsOptional()
  @IsEnum(SellOrderStatus)
  status?: SellOrderStatus;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

export class AdminBuyOrderListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ type: AdminPartyDto })
  buyer!: AdminPartyDto;

  @ApiProperty()
  coinAmount!: string;

  @ApiProperty({ enum: BuyOrderStatus })
  status!: BuyOrderStatus;

  @ApiProperty()
  rematchCount!: number;

  @ApiPropertyOptional({ nullable: true })
  matchedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminSellOrderListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ type: AdminPartyDto })
  seller!: AdminPartyDto;

  @ApiProperty()
  originalCoinAmount!: string;

  @ApiProperty()
  remainingCoinAmount!: string;

  @ApiProperty()
  reservedCoinAmount!: string;

  @ApiProperty()
  completedCoinAmount!: string;

  @ApiProperty()
  cancelledCoinAmount!: string;

  @ApiProperty()
  minimumTradeAmount!: string;

  @ApiProperty({ enum: SellOrderStatus })
  status!: SellOrderStatus;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminMatchingAttemptItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buyOrderId!: string;

  @ApiPropertyOptional({ nullable: true })
  sellOrderId!: string | null;

  @ApiProperty()
  result!: string;

  @ApiPropertyOptional({ nullable: true })
  tradeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reasonCode!: string | null;

  @ApiProperty()
  attemptedAt!: Date;
}

export class AdminBuyOrderDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ type: AdminPartyDto })
  buyer!: AdminPartyDto;

  @ApiProperty()
  coinAmount!: string;

  @ApiProperty({ enum: BuyOrderStatus })
  status!: BuyOrderStatus;

  @ApiProperty()
  rematchCount!: number;

  @ApiPropertyOptional({ nullable: true })
  nextMatchableAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  matchedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: [AdminMatchingAttemptItemDto] })
  matchingAttempts?: AdminMatchingAttemptItemDto[];
}

export class AdminSellOrderCoinLotItemDto {
  @ApiProperty()
  coinLotId!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceType!: string | null;

  @ApiProperty()
  lockedAmount!: string;

  @ApiProperty()
  consumedAmount!: string;

  @ApiProperty()
  releasedAmount!: string;
}

export class AdminSellOrderDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ type: AdminPartyDto })
  seller!: AdminPartyDto;

  @ApiProperty()
  originalCoinAmount!: string;

  @ApiProperty()
  remainingCoinAmount!: string;

  @ApiProperty()
  reservedCoinAmount!: string;

  @ApiProperty()
  completedCoinAmount!: string;

  @ApiProperty()
  cancelledCoinAmount!: string;

  @ApiProperty()
  minimumTradeAmount!: string;

  @ApiProperty()
  minSplitRatioBpsSnapshot!: number;

  @ApiProperty({ enum: SellOrderStatus })
  status!: SellOrderStatus;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: [AdminMatchingAttemptItemDto] })
  matchingAttempts?: AdminMatchingAttemptItemDto[];
}
