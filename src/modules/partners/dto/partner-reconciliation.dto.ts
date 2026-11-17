import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PartnerExchangeJobStatus } from '../domain/enums/partner-exchange-job-status.enum';
import { PartnerExchangeOpsNoteAction } from '../domain/enums/partner-exchange-ops-note-action.enum';
import { PartnerExchangeStatus } from '../domain/enums/partner-exchange-status.enum';
import { PartnerExternalResultStatus } from '../domain/enums/partner-external-result-status.enum';
import { PartnerWebhookDeliveryStatus } from '../domain/enums/partner-webhook-delivery-status.enum';

export class SearchReconciliationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '업체 ID 필터' })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({
    description:
      '기본 RECONCILIATION_REQUIRED. includeStale=true면 장기 PROCESSING/LOCKED 포함',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeStale?: boolean = true;

  @ApiPropertyOptional({
    description: '장기 건 기준(분). includeStale 시 사용',
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  olderThanMinutes?: number = 30;
}

export class CreatePartnerExchangeOpsNoteDto {
  @ApiProperty({ example: '업체 STATUS 확인 — 아직 PROCESSING' })
  @IsString()
  @Length(1, 1000)
  note!: string;

  @ApiPropertyOptional({ example: '운영 조사' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export type ReconPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export class ReconciliationQueueItemDto {
  @ApiProperty()
  exchangeId!: string;

  @ApiProperty()
  exchangeNumber!: string;

  @ApiProperty()
  partnerId!: string;

  @ApiProperty()
  partnerName!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: PartnerExchangeStatus })
  status!: PartnerExchangeStatus;

  @ApiProperty({ enum: PartnerExternalResultStatus })
  externalResultStatus!: PartnerExternalResultStatus;

  @ApiPropertyOptional({ nullable: true })
  jobStatus!: PartnerExchangeJobStatus | null;

  @ApiPropertyOptional({ nullable: true })
  lastAttemptResult!: string | null;

  @ApiPropertyOptional({ nullable: true })
  intentId!: string | null;

  @ApiProperty()
  ageMinutes!: number;

  @ApiProperty()
  priority!: ReconPriority;

  @ApiProperty()
  requestedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  assetLockedAt!: string | null;
}

export class ReconciliationMetricsDto {
  @ApiProperty()
  reconciliationRequiredCount!: number;

  @ApiProperty({ description: '잠금 중(미확정) 금액 합' })
  lockedAmountTotal!: string;

  @ApiPropertyOptional({ nullable: true })
  oldestAgeMinutes!: number | null;

  @ApiProperty({
    description: '업체 SUCCEEDED인데 BRIT 미 COMPLETED',
  })
  partnerSucceededBritOpenCount!: number;

  @ApiProperty()
  webhookDeliveryFailedCount!: number;
}

export class ReconciliationOpsNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  authorUserId!: string;

  @ApiProperty()
  note!: string;

  @ApiProperty({ enum: PartnerExchangeOpsNoteAction })
  action!: PartnerExchangeOpsNoteAction;

  @ApiProperty()
  createdAt!: string;
}

export class ReconciliationDetailDto {
  @ApiProperty()
  exchangeId!: string;

  @ApiProperty()
  exchangeNumber!: string;

  @ApiProperty()
  partnerId!: string;

  @ApiProperty()
  partnerName!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: PartnerExchangeStatus })
  status!: PartnerExchangeStatus;

  @ApiProperty({ enum: PartnerExternalResultStatus })
  externalResultStatus!: PartnerExternalResultStatus;

  @ApiPropertyOptional({ nullable: true })
  partnerTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureMessage!: string | null;

  @ApiPropertyOptional({ nullable: true })
  intentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  externalOrderId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  intentStatus!: string | null;

  @ApiProperty()
  remainingLockedAmount!: string;

  @ApiProperty()
  canSettle!: boolean;

  @ApiProperty({ type: [Object] })
  attempts!: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ nullable: true, type: Object })
  job!: Record<string, unknown> | null;

  @ApiProperty({ type: [Object] })
  events!: Array<Record<string, unknown>>;

  @ApiProperty({ type: [Object] })
  deliveries!: Array<{
    id: string;
    status: PartnerWebhookDeliveryStatus;
    destinationUrl: string;
    attemptCount: number;
    lastError: string | null;
    deliveredAt: string | null;
  }>;

  @ApiProperty({ type: [ReconciliationOpsNoteDto] })
  notes!: ReconciliationOpsNoteDto[];
}
