import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import type { PaginationMeta } from '../../../common/dto/pagination-query.dto';
import { DISPUTE_MESSAGE_MAX_LENGTH } from '../domain/constants/trade.constants';
import { TradeDisputeActionType } from '../domain/enums/trade-dispute-action-type.enum';
import { TradeDisputeStatus } from '../domain/enums/trade-dispute-status.enum';
import { TradeEventActorType } from '../domain/enums/trade-event-actor-type.enum';

export class CreateDisputeMessageDto {
  @ApiProperty({ minLength: 1, maxLength: DISPUTE_MESSAGE_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(DISPUTE_MESSAGE_MAX_LENGTH)
  body!: string;
}

export class AdminCreateDisputeMessageDto extends CreateDisputeMessageDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isInternal?: boolean;
}

export class SearchDisputeMessagesDto extends PaginationQueryDto {}

export class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PartyDisputeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TradeDisputeStatus })
  status!: TradeDisputeStatus;

  @ApiProperty()
  canChat!: boolean;
}

export class PartyDisputeDetailDto extends PartyDisputeSummaryDto {
  @ApiProperty()
  tradeId!: string;

  @ApiProperty()
  displayName!: string;
}

export class PartyDisputeMessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TradeDisputeActionType })
  actionType!: TradeDisputeActionType;

  @ApiProperty({ enum: TradeEventActorType })
  actorRole!: TradeEventActorType;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  isMine!: boolean;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PartyDisputeMessageListDto {
  @ApiProperty({ type: [PartyDisputeMessageDto] })
  items!: PartyDisputeMessageDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMeta;
}

export class AdminDisputeMessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TradeDisputeActionType })
  actionType!: TradeDisputeActionType;

  @ApiProperty()
  isInternal!: boolean;

  @ApiPropertyOptional({ nullable: true })
  actorUserId!: string | null;

  @ApiProperty({ enum: TradeEventActorType })
  actorRole!: TradeEventActorType;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminDisputeMessageListDto {
  @ApiProperty({ type: [AdminDisputeMessageDto] })
  items!: AdminDisputeMessageDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMeta;
}
