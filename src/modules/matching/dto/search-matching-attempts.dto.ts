import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { DateRangeQueryDto } from '../../../common/dto/date-range-query.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MatchingAttemptResult } from '../domain/enums/matching-attempt-result.enum';

export class SearchMatchingAttemptsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buyOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellOrderId?: string;

  @ApiPropertyOptional({ enum: MatchingAttemptResult })
  @IsOptional()
  @IsEnum(MatchingAttemptResult)
  result?: MatchingAttemptResult;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
