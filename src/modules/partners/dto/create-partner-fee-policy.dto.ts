import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { FeeRoundingRule } from '../domain/enums/fee-rounding-rule.enum';
import { FeeSettlementCycle } from '../domain/enums/fee-settlement-cycle.enum';
import { PartnerFeeTarget } from '../domain/enums/partner-fee-target.enum';

export class CreatePartnerFeePolicyDto {
  @ApiProperty({ enum: PartnerFeeTarget })
  @IsEnum(PartnerFeeTarget)
  feeTarget!: PartnerFeeTarget;

  @ApiProperty({ example: 70, description: '수수료율 (bps). 70 = 0.7%' })
  @IsInt()
  @Min(0)
  @Max(10000)
  feeRateBps!: number;

  @ApiPropertyOptional({ example: 0, description: '고정 수수료 (MS 최소단위)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedFeeAmount?: number;

  @ApiPropertyOptional({ enum: FeeRoundingRule, default: FeeRoundingRule.FLOOR })
  @IsOptional()
  @IsEnum(FeeRoundingRule)
  roundingRule?: FeeRoundingRule;

  @ApiPropertyOptional({
    enum: FeeSettlementCycle,
    default: FeeSettlementCycle.WEEKLY,
  })
  @IsOptional()
  @IsEnum(FeeSettlementCycle)
  settlementCycle?: FeeSettlementCycle;

  @ApiPropertyOptional({ example: 1, description: '1=월 … 7=일 (WEEKLY)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  settlementWeekday?: number | null;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  paymentDueDays?: number;

  @ApiProperty({ example: '2026-11-05T00:00:00.000Z' })
  @IsISO8601()
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '초기 수수료 0.7%' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
