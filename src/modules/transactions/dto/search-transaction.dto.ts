import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { TransactionStatusFilter } from '../domain/enums/transaction-status.enum';
import { TransactionTypeFilter } from '../domain/enums/transaction-type-filter.enum';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function toStatusList({ value }: { value: unknown }): unknown {
  if (value == null || value === '') return undefined;
  const list: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [value];
  return list
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '');
}

/** 요약과 목록이 같이 쓰는 조건 */
export class TransactionFilterQueryDto {
  @ApiPropertyOptional({ enum: TransactionTypeFilter, default: 'ALL' })
  @IsOptional()
  @IsEnum(TransactionTypeFilter)
  type?: TransactionTypeFilter;

  @ApiPropertyOptional({
    description: '쉼표 구분. PROCESSING은 확인 중(CHECKING)을 포함한다.',
    example: 'COMPLETED,PROCESSING',
  })
  @IsOptional()
  @Transform(toStatusList)
  @IsEnum(TransactionStatusFilter, { each: true })
  status?: TransactionStatusFilter[];
}

export class SearchTransactionDto extends TransactionFilterQueryDto {
  @ApiPropertyOptional({
    description: 'KST 월 (YYYY-MM). 없으면 기간 제한 없이 최신순',
    example: '2026-11',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN)
  month?: string;

  @ApiPropertyOptional({
    description: 'KST 하루 (YYYY-MM-DD). month보다 우선한다.',
    example: '2026-11-07',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;

  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 30;
}

export class TransactionSummaryQueryDto extends TransactionFilterQueryDto {
  @ApiProperty({ description: 'KST 월 (YYYY-MM)', example: '2026-11' })
  @Matches(MONTH_PATTERN)
  month!: string;
}
