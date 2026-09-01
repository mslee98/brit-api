import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TradeStatus } from '../domain/enums/trade-status.enum';

export enum TradeViewerRole {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
}

export class TradeActionsDto {
  @ApiProperty()
  canReportPayment!: boolean;

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
  canOpenDispute!: boolean;
}

export class TradePaymentDto {
  @ApiProperty()
  bankName!: string;

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

  @ApiProperty({ type: TradeActionsDto })
  actions!: TradeActionsDto;

  @ApiProperty()
  buyerPaymentDueAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  sellerConfirmationDueAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  alreadyReported?: boolean;

  @ApiPropertyOptional()
  alreadyConfirmed?: boolean;

  @ApiPropertyOptional()
  alreadyCancelled?: boolean;
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
}
