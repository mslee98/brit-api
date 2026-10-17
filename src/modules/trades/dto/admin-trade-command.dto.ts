import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { TradeDisputeReasonCode } from '../domain/enums/trade-dispute-reason-code.enum';
import { TradeDisputeResolution } from '../domain/enums/trade-dispute-resolution.enum';

export class AdminTradeReasonDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AdminOpenDisputeDto {
  @ApiProperty({ enum: TradeDisputeReasonCode })
  @IsEnum(TradeDisputeReasonCode)
  reasonCode!: TradeDisputeReasonCode;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AdminResolveDisputeDto {
  @ApiProperty({ enum: TradeDisputeResolution })
  @IsEnum(TradeDisputeResolution)
  resolution!: TradeDisputeResolution;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AdminAssignDisputeDto {
  @ApiPropertyOptional({ description: '생략하면 본인 수령' })
  @IsOptional()
  @IsUUID()
  adminUserId?: string;
}

export class OpenTradeDisputeDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
