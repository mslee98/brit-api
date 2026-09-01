import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class AuditLogActorDto {
  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;
}

export class AuditLogTargetUserDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  loginId!: string;

  @ApiProperty()
  name!: string;
}

export class AuditLogCoinDeductionDto {
  @ApiProperty()
  nonSellableAmount!: string;

  @ApiProperty()
  sellableAmount!: string;
}

export class AuditLogCoinAdjustmentSummaryDto {
  @ApiProperty()
  transactionId!: string;

  @ApiProperty()
  amount!: string;

  @ApiPropertyOptional({ nullable: true })
  balanceType!: string | null;

  @ApiPropertyOptional({ type: AuditLogCoinDeductionDto, nullable: true })
  deduction!: AuditLogCoinDeductionDto | null;
}

export class AuditLogListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: AuditLogActorDto })
  actor!: AuditLogActorDto;

  @ApiProperty()
  actionType!: string;

  @ApiProperty()
  targetType!: string;

  @ApiPropertyOptional({ nullable: true })
  targetId!: string | null;

  @ApiPropertyOptional({ type: AuditLogTargetUserDto, nullable: true })
  target!: AuditLogTargetUserDto | null;

  @ApiPropertyOptional({ type: AuditLogCoinAdjustmentSummaryDto, nullable: true })
  coinAdjustment!: AuditLogCoinAdjustmentSummaryDto | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ipAddress!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogListItemDto] })
  items!: AuditLogListItemDto[];

  @ApiProperty({ type: AuditLogPaginationDto })
  pagination!: AuditLogPaginationDto;
}

export class AuditLogDetailDto extends AuditLogListItemDto {
  @ApiPropertyOptional({ nullable: true })
  beforeData!: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  afterData!: Record<string, unknown> | null;
}
