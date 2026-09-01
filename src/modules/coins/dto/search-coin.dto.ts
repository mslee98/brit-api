import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CoinHistoryTypeFilter } from '../domain/enums/coin-history-type-filter.enum';

export class SearchCoinHistoryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CoinHistoryTypeFilter,
    default: CoinHistoryTypeFilter.ALL,
    description: '이력 유형 필터 (presentation group)',
  })
  @IsOptional()
  @IsEnum(CoinHistoryTypeFilter)
  type: CoinHistoryTypeFilter = CoinHistoryTypeFilter.ALL;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: '조회 시작일 (YYYY-MM-DD, KST 00:00 inclusive)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-10',
    description:
      '조회 종료일 (YYYY-MM-DD, KST 해당일 포함 → 다음날 00:00 exclusive)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SearchCoinLotsDto extends PaginationQueryDto {}
