import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 목록 조회 공통 페이지 쿼리. page 기본 1, size 기본 20(최대 100). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 20;
}

export type PaginationMeta = {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
};

export function buildPaginationMeta(
  page: number,
  size: number,
  totalItems: number,
): PaginationMeta {
  return {
    page,
    size,
    totalItems,
    totalPages: size > 0 ? Math.ceil(totalItems / size) : 0,
  };
}
