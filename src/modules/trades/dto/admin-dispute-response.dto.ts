import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdminPartyDto } from '../../users/dto/admin-party.dto';
import { TradeDisputePriority } from '../domain/enums/trade-dispute-priority.enum';
import { TradeDisputeResolution } from '../domain/enums/trade-dispute-resolution.enum';
import { TradeDisputeStatus } from '../domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../domain/enums/trade-status.enum';
import {
  AdminSellerBankAccountDto,
  AdminTradeEventDto,
} from './admin-trade-response.dto';

export class AdminDisputeListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  disputeNumber!: string;

  @ApiProperty()
  tradeId!: string;

  @ApiProperty()
  tradeNumber!: string;

  @ApiProperty({ enum: TradeDisputeStatus })
  status!: TradeDisputeStatus;

  @ApiProperty({ enum: TradeDisputePriority })
  priority!: TradeDisputePriority;

  @ApiProperty()
  reasonCode!: string;

  @ApiProperty({ type: AdminPartyDto })
  buyer!: AdminPartyDto;

  @ApiProperty({ type: AdminPartyDto })
  seller!: AdminPartyDto;

  @ApiProperty({ description: 'bigint string' })
  paymentAmount!: string;

  @ApiProperty({ description: 'bigint string' })
  coinAmount!: string;

  @ApiPropertyOptional({ nullable: true })
  assignedAdminUserId!: string | null;

  @ApiProperty()
  requestedAt!: Date;

  @ApiPropertyOptional({ enum: TradeDisputeResolution, nullable: true })
  resolution!: TradeDisputeResolution | null;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: Date | null;
}

export class AdminDisputeTradeSnapshotDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tradeNumber!: string;

  @ApiProperty({ enum: TradeStatus })
  status!: TradeStatus;

  @ApiProperty({ description: 'bigint string' })
  coinAmount!: string;

  @ApiProperty({ description: 'bigint string' })
  paymentAmount!: string;

  @ApiProperty({ type: AdminPartyDto })
  buyer!: AdminPartyDto;

  @ApiProperty({ type: AdminPartyDto })
  seller!: AdminPartyDto;

  @ApiProperty({ type: AdminSellerBankAccountDto })
  sellerBankAccount!: AdminSellerBankAccountDto;

  @ApiPropertyOptional({ nullable: true })
  buyerReportedPaidAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  sellerConfirmationDueAt!: Date | null;

  @ApiProperty({ type: [AdminTradeEventDto] })
  events!: AdminTradeEventDto[];
}

export class AdminDisputeDetailDto extends AdminDisputeListItemDto {
  @ApiPropertyOptional({ nullable: true })
  assignedAt!: Date | null;

  @ApiProperty({ type: AdminDisputeTradeSnapshotDto })
  trade!: AdminDisputeTradeSnapshotDto;
}
