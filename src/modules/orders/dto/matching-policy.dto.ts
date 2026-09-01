import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MatchingPolicyEntity } from '../infrastructure/entities/matching-policy.entity';

export class MatchingPolicyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  minSplitRatioBps!: number;

  @ApiProperty()
  buyerPaymentTimeoutSeconds!: number;

  @ApiProperty()
  sellerConfirmationTimeoutSeconds!: number;

  @ApiProperty()
  maxRematchCount!: number;

  @ApiProperty({ description: 'Near 허용 비율 bps (1000=10%)' })
  nearMatchMaxRatioBps!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  effectiveFrom!: Date;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  createdByUserId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static from(entity: MatchingPolicyEntity): MatchingPolicyResponseDto {
    return {
      id: entity.id,
      minSplitRatioBps: entity.minSplitRatioBps,
      buyerPaymentTimeoutSeconds: entity.buyerPaymentTimeoutSeconds,
      sellerConfirmationTimeoutSeconds: entity.sellerConfirmationTimeoutSeconds,
      maxRematchCount: entity.maxRematchCount,
      nearMatchMaxRatioBps: entity.nearMatchMaxRatioBps,
      isActive: entity.isActive,
      effectiveFrom: entity.effectiveFrom,
      reason: entity.reason,
      createdByUserId: entity.createdByUserId,
      createdAt: entity.createdAt,
    };
  }
}

export class SearchMatchingPoliciesDto extends PaginationQueryDto {}

export class CreateMatchingPolicyDto {
  @ApiProperty({ example: 2000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  minSplitRatioBps!: number;

  @ApiProperty({ example: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  buyerPaymentTimeoutSeconds!: number;

  @ApiProperty({ example: 180 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  sellerConfirmationTimeoutSeconds!: number;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxRematchCount!: number;

  @ApiProperty({ example: 1000, description: 'Near 허용 비율 bps' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  nearMatchMaxRatioBps!: number;

  @ApiProperty({ example: '2026-08-20T00:00:00+09:00' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
