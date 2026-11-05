import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { FeeRoundingRule } from '../domain/enums/fee-rounding-rule.enum';
import { FeeSettlementCycle } from '../domain/enums/fee-settlement-cycle.enum';
import { PartnerFeeTarget } from '../domain/enums/partner-fee-target.enum';
import { PartnerFeePolicyEntity } from '../infrastructure/entities/partner-fee-policy.entity';

export class PartnerFeePolicyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  partnerId!: string;

  @ApiProperty({ enum: PartnerFeeTarget })
  feeTarget!: PartnerFeeTarget;

  @ApiProperty()
  feeRateBps!: number;

  @ApiProperty({ description: '고정 수수료 (문자열 bigint)' })
  fixedFeeAmount!: string;

  @ApiProperty({ enum: FeeRoundingRule })
  roundingRule!: FeeRoundingRule;

  @ApiProperty({ enum: FeeSettlementCycle })
  settlementCycle!: FeeSettlementCycle;

  @ApiPropertyOptional({ nullable: true })
  settlementWeekday!: number | null;

  @ApiProperty()
  paymentDueDays!: number;

  @ApiProperty()
  effectiveFrom!: string;

  @ApiPropertyOptional({ nullable: true })
  effectiveTo!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdByUserId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  static from(entity: PartnerFeePolicyEntity): PartnerFeePolicyResponseDto {
    const dto = new PartnerFeePolicyResponseDto();
    dto.id = entity.id;
    dto.partnerId = entity.partnerId;
    dto.feeTarget = entity.feeTarget;
    dto.feeRateBps = entity.feeRateBps;
    dto.fixedFeeAmount = entity.fixedFeeAmount;
    dto.roundingRule = entity.roundingRule;
    dto.settlementCycle = entity.settlementCycle;
    dto.settlementWeekday = entity.settlementWeekday;
    dto.paymentDueDays = entity.paymentDueDays;
    dto.effectiveFrom = entity.effectiveFrom.toISOString();
    dto.effectiveTo = entity.effectiveTo?.toISOString() ?? null;
    dto.isActive = entity.isActive;
    dto.createdByUserId = entity.createdByUserId;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
