import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PartnerExchangeStatus } from '../domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from '../domain/enums/partner-exchange-type.enum';
import { PartnerFeeAccrualStatus } from '../domain/enums/partner-fee-accrual-status.enum';
import { PartnerMemberRole } from '../domain/enums/partner-member-role.enum';
import { PartnerStatus } from '../domain/enums/partner-status.enum';
import { PartnerExchangeEntity } from '../infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from '../infrastructure/entities/partner-fee-accrual.entity';
import { PartnerEntity } from '../infrastructure/entities/partner.entity';

export class PartnerPortalMeResponseDto {
  @ApiProperty()
  partnerId!: string;

  @ApiProperty()
  partnerCode!: string;

  @ApiProperty()
  partnerName!: string;

  @ApiProperty({ enum: PartnerStatus })
  partnerStatus!: PartnerStatus;

  @ApiProperty()
  memberId!: string;

  @ApiProperty({ enum: PartnerMemberRole })
  memberRole!: PartnerMemberRole;

  static from(
    partner: PartnerEntity,
    memberId: string,
    memberRole: PartnerMemberRole,
  ): PartnerPortalMeResponseDto {
    const dto = new PartnerPortalMeResponseDto();
    dto.partnerId = partner.id;
    dto.partnerCode = partner.code;
    dto.partnerName = partner.name;
    dto.partnerStatus = partner.status;
    dto.memberId = memberId;
    dto.memberRole = memberRole;
    return dto;
  }
}

export class PartnerPortalDashboardResponseDto {
  @ApiProperty()
  partnerId!: string;

  @ApiProperty()
  partnerCode!: string;

  @ApiProperty()
  partnerName!: string;

  @ApiProperty({ enum: PartnerStatus })
  partnerStatus!: PartnerStatus;

  @ApiProperty({ description: '오늘(UTC 일자) 발생 수수료 합' })
  todayFeeAmount!: string;

  @ApiProperty({ description: '누적(ACCRUED+SETTLED) 수수료 합' })
  cumulativeFeeAmount!: string;

  @ApiProperty({ description: '미정산(ACCRUED) 수수료 합' })
  accruedFeeAmount!: string;

  @ApiProperty({ description: '오늘 완료된 CHARGE 건수' })
  todayChargeCount!: number;

  @ApiProperty({ description: '오늘 완료된 REDEEM 건수' })
  todayRedeemCount!: number;

  @ApiProperty({ description: '오늘 완료된 CHARGE 금액 합' })
  todayChargeAmount!: string;

  @ApiProperty({ description: '오늘 완료된 REDEEM 금액 합' })
  todayRedeemAmount!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: '현재 유효한 활성 수수료 정책 id',
  })
  activeFeePolicyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  activeFeeRateBps!: number | null;
}

export class PartnerExchangeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  exchangeNumber!: string;

  @ApiProperty({ enum: PartnerExchangeType })
  exchangeType!: PartnerExchangeType;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: PartnerExchangeStatus })
  status!: PartnerExchangeStatus;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({ nullable: true })
  partnerTransactionId!: string | null;

  @ApiProperty()
  requestedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureMessage!: string | null;

  static from(entity: PartnerExchangeEntity): PartnerExchangeResponseDto {
    const dto = new PartnerExchangeResponseDto();
    dto.id = entity.id;
    dto.exchangeNumber = entity.exchangeNumber;
    dto.exchangeType = entity.exchangeType;
    dto.amount = entity.amount;
    dto.status = entity.status;
    dto.userId = entity.userId;
    dto.partnerTransactionId = entity.partnerTransactionId;
    dto.requestedAt = entity.requestedAt.toISOString();
    dto.completedAt = entity.completedAt?.toISOString() ?? null;
    dto.failedAt = entity.failedAt?.toISOString() ?? null;
    dto.failureCode = entity.failureCode;
    dto.failureMessage = entity.failureMessage;
    return dto;
  }
}

export class PartnerFeeAccrualResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  partnerExchangeId!: string;

  @ApiProperty()
  feePolicyId!: string;

  @ApiProperty({ enum: PartnerExchangeType })
  exchangeType!: PartnerExchangeType;

  @ApiProperty()
  grossAmount!: string;

  @ApiProperty()
  feeRateBps!: number;

  @ApiProperty()
  fixedFeeAmount!: string;

  @ApiProperty()
  percentageFeeAmount!: string;

  @ApiProperty()
  totalFeeAmount!: string;

  @ApiProperty({ enum: PartnerFeeAccrualStatus })
  status!: PartnerFeeAccrualStatus;

  @ApiProperty()
  accruedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  settledAt!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '연결된 전환 번호 (join 시)',
  })
  exchangeNumber!: string | null;

  static from(
    entity: PartnerFeeAccrualEntity,
    exchangeNumber?: string | null,
  ): PartnerFeeAccrualResponseDto {
    const dto = new PartnerFeeAccrualResponseDto();
    dto.id = entity.id;
    dto.partnerExchangeId = entity.partnerExchangeId;
    dto.feePolicyId = entity.feePolicyId;
    dto.exchangeType = entity.exchangeType;
    dto.grossAmount = entity.grossAmount;
    dto.feeRateBps = entity.feeRateBps;
    dto.fixedFeeAmount = entity.fixedFeeAmount;
    dto.percentageFeeAmount = entity.percentageFeeAmount;
    dto.totalFeeAmount = entity.totalFeeAmount;
    dto.status = entity.status;
    dto.accruedAt = entity.accruedAt.toISOString();
    dto.settledAt = entity.settledAt?.toISOString() ?? null;
    dto.exchangeNumber = exchangeNumber ?? null;
    return dto;
  }
}
