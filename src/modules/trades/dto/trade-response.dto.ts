import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TradeDisputeStatus } from '../domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../domain/enums/trade-status.enum';

export enum TradeViewerRole {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
}

export class TradeActionsDto {
  @ApiProperty()
  canReportPayment!: boolean;

  @ApiProperty()
  canWithdrawPaymentReport!: boolean;

  @ApiProperty()
  canConfirmPayment!: boolean;

  @ApiProperty()
  canCancel!: boolean;

  @ApiProperty()
  canRequestCancellation!: boolean;

  @ApiProperty()
  canAgreeCancellation!: boolean;

  @ApiProperty()
  canReportRefund!: boolean;

  @ApiProperty()
  canConfirmRefund!: boolean;

  @ApiProperty()
  canMarkUnpaid!: boolean;

  @ApiProperty()
  canDenyPayment!: boolean;

  @ApiProperty()
  canOpenDispute!: boolean;
}

export class TradePaymentDto {
  @ApiProperty({ description: 'banks.code' })
  bankCode!: string;

  @ApiProperty()
  bankName!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: '은행 로고 공개 URL (/assets/banks/...)',
  })
  iconUrl!: string | null;

  @ApiProperty()
  accountNumber!: string;

  @ApiProperty()
  accountHolderName!: string;

  @ApiProperty()
  dueAt!: Date;
}

export class TradeCounterpartyDto {
  @ApiProperty()
  nickname!: string;
}

export class TradeDisputeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TradeDisputeStatus })
  status!: TradeDisputeStatus;

  @ApiProperty()
  canChat!: boolean;
}

export class TradeResponseDto {
  @ApiProperty()
  tradeId!: string;

  @ApiProperty()
  tradeNumber!: string;

  @ApiProperty({ enum: TradeViewerRole })
  role!: TradeViewerRole;

  @ApiProperty({ enum: TradeStatus })
  status!: TradeStatus;

  @ApiProperty({ description: 'bigint string' })
  coinAmount!: string;

  @ApiProperty({ description: 'bigint string' })
  paymentAmount!: string;

  @ApiPropertyOptional({ type: TradePaymentDto, nullable: true })
  payment!: TradePaymentDto | null;

  @ApiPropertyOptional({ type: TradeCounterpartyDto })
  counterparty?: TradeCounterpartyDto;

  @ApiPropertyOptional({ type: TradeDisputeSummaryDto, nullable: true })
  dispute!: TradeDisputeSummaryDto | null;

  @ApiProperty({ type: TradeActionsDto })
  actions!: TradeActionsDto;

  @ApiProperty()
  buyerPaymentDueAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  sellerConfirmationDueAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: '취소 사유 원문' })
  cancellationReason!: string | null;

  @ApiPropertyOptional()
  alreadyReported?: boolean;

  @ApiPropertyOptional()
  alreadyConfirmed?: boolean;

  @ApiPropertyOptional()
  alreadyCancelled?: boolean;

  @ApiPropertyOptional()
  alreadyDisputed?: boolean;
}

export class TradeListItemDto {
  @ApiProperty()
  tradeId!: string;

  @ApiProperty()
  tradeNumber!: string;

  @ApiProperty({ enum: TradeViewerRole })
  role!: TradeViewerRole;

  @ApiProperty({ enum: TradeStatus })
  status!: TradeStatus;

  @ApiProperty({ description: 'bigint string' })
  coinAmount!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: TradeDisputeSummaryDto, nullable: true })
  dispute!: TradeDisputeSummaryDto | null;
}
