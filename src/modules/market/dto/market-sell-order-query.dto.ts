import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MarketSellOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: '최소 거래 가능 수량 필터 (remaining_coin_amount >= minAmount)',
    example: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minAmount?: number;

  @ApiPropertyOptional({
    description: '최대 거래 가능 수량 필터 (remaining_coin_amount <= maxAmount)',
    example: 1000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAmount?: number;
}
