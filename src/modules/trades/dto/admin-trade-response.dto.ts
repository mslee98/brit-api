import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdminPartyDto } from '../../users/dto/admin-party.dto';
import { TradeDisputePriority } from '../domain/enums/trade-dispute-priority.enum';
import { TradeDisputeStatus } from '../domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../domain/enums/trade-status.enum';

export class AdminTradeListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tradeNumber!: string;

  @ApiProperty({ type: AdminPartyDto })
  buyer!: AdminPartyDto;

  @ApiProperty({ type: AdminPartyDto })
  seller!: AdminPartyDto;

  @ApiProperty({ description: 'bigint string' })
  coinAmount!: string;

  @ApiProperty({ description: 'bigint string' })
  paymentAmount!: string;

  @ApiProperty({ enum: TradeStatus })
  status!: TradeStatus;

  @ApiProperty()
  buyerPaymentDueAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  sellerConfirmationDueAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  buyerReportedPaidAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminTradeOrderRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNumber!: string;
}

export class AdminSellerBankAccountDto {
  @ApiProperty()
  bankCode!: string;

  @ApiProperty()
  bankName!: string;

  @ApiProperty({ description: '마스킹된 계좌번호' })
  accountNumber!: string;

  @ApiProperty()
  holderName!: string;
}

export class AdminTradeCoinLotDto {
  @ApiProperty()
  coinLotId!: string;

  @ApiProperty()
  allocatedAmount!: string;

  @ApiProperty()
  transferredAmount!: string;

  @ApiProperty()
  returnedAmount!: string;
}

export class AdminTradeEventDto {
  @ApiProperty()
  eventCode!: string;

  @ApiPropertyOptional({ nullable: true })
  previousStatus!: TradeStatus | null;

  @ApiPropertyOptional({ nullable: true })
  newStatus!: TradeStatus | null;

  @ApiProperty()
  actorType!: string;

  @ApiPropertyOptional({ nullable: true })
  actorUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  message!: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminTradeDisputeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  disputeNumber!: string;

  @ApiProperty({ enum: TradeDisputeStatus })
  status!: TradeDisputeStatus;

  @ApiProperty({ enum: TradeDisputePriority })
  priority!: TradeDisputePriority;

  @ApiProperty()
  reasonCode!: string;

  @ApiProperty()
  requestedAt!: Date;
}

export class AdminTradeDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tradeNumber!: string;

  @ApiProperty({ enum: TradeStatus })
  status!: TradeStatus;

  @ApiProperty()
  coinAmount!: string;

  @ApiProperty()
  paymentAmount!: string;

  @ApiProperty({ type: AdminPartyDto })
  buyer!: AdminPartyDto;

  @ApiProperty({ type: AdminPartyDto })
  seller!: AdminPartyDto;

  @ApiProperty({ type: AdminSellerBankAccountDto })
  sellerBankAccount!: AdminSellerBankAccountDto;

  @ApiProperty({ type: AdminTradeOrderRefDto })
  buyOrder!: AdminTradeOrderRefDto;

  @ApiProperty({ type: AdminTradeOrderRefDto })
  sellOrder!: AdminTradeOrderRefDto;

  @ApiProperty({ type: [AdminTradeCoinLotDto] })
  coinLots!: AdminTradeCoinLotDto[];

  @ApiProperty({ type: [AdminTradeEventDto] })
  events!: AdminTradeEventDto[];

  @ApiPropertyOptional({ type: AdminTradeDisputeDto, nullable: true })
  dispute!: AdminTradeDisputeDto | null;

  @ApiProperty()
  buyerPaymentDueAt!: Date;

  @ApiProperty()
  buyerPaymentTimeoutSeconds!: number;

  @ApiPropertyOptional({ nullable: true })
  sellerConfirmationDueAt!: Date | null;

  @ApiProperty()
  sellerConfirmationTimeoutSeconds!: number;

  @ApiPropertyOptional({ nullable: true })
  buyerReportedPaidAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  sellerConfirmedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
