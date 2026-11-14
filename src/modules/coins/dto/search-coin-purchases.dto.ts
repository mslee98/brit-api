import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CoinPurchaseStatus } from '../domain/enums/coin-purchase-status.enum';

export class SearchCoinPurchasesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CoinPurchaseStatus })
  @IsOptional()
  @IsEnum(CoinPurchaseStatus)
  status?: CoinPurchaseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
