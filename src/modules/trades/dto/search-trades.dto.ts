import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { TradeDisputePriority } from '../domain/enums/trade-dispute-priority.enum';
import { TradeDisputeReasonCode } from '../domain/enums/trade-dispute-reason-code.enum';
import { TradeDisputeStatus } from '../domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../domain/enums/trade-status.enum';

export class SearchMyTradesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TradeStatus })
  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;
}

export class SearchAdminTradesDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ enum: TradeStatus })
  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buyerUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellerUserId?: string;

  @ApiPropertyOptional({
    description: '구매자 또는 판매자 userId (OR)',
  })
  @IsOptional()
  @IsUUID()
  partyUserId?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isTimedOut?: boolean;
}

export class SearchAdminTradeTimeoutsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

export class SearchAdminDisputesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TradeDisputeStatus })
  @IsOptional()
  @IsEnum(TradeDisputeStatus)
  status?: TradeDisputeStatus;

  @ApiPropertyOptional({ enum: TradeDisputeReasonCode })
  @IsOptional()
  @IsEnum(TradeDisputeReasonCode)
  reasonCode?: TradeDisputeReasonCode;

  @ApiPropertyOptional({ enum: TradeDisputePriority })
  @IsOptional()
  @IsEnum(TradeDisputePriority)
  priority?: TradeDisputePriority;

  @ApiPropertyOptional({
    description: 'me | unassigned | admin UUID',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(me|unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  assignee?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({
    description: '구매자 또는 판매자 userId (OR)',
  })
  @IsOptional()
  @IsUUID()
  partyUserId?: string;
}
