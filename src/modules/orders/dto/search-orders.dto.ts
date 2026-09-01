import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { BuyOrderStatus } from '../domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';

export class SearchBuyOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BuyOrderStatus })
  @IsOptional()
  @IsEnum(BuyOrderStatus)
  status?: BuyOrderStatus;
}

export class SearchSellOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SellOrderStatus })
  @IsOptional()
  @IsEnum(SellOrderStatus)
  status?: SellOrderStatus;
}

export enum AdminOrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export class SearchAdminOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AdminOrderSide })
  @IsOptional()
  @IsEnum(AdminOrderSide)
  side?: AdminOrderSide;
}

export class AdminOrderListItemDto {
  @ApiProperty({ enum: AdminOrderSide })
  side!: AdminOrderSide;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  coinAmount!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  createdAt!: Date;
}
