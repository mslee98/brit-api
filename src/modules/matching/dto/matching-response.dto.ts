import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { BuyMatchType } from '../../orders/domain/enums/buy-match-type.enum';
import { BuyOrderStatus } from '../../orders/domain/enums/buy-order-status.enum';
import { TradeStatus } from '../../trades/domain/enums/trade-status.enum';
import { TradeRequestRejectionReason } from '../domain/enums/trade-request-rejection-reason.enum';
import { TradeRequestStatus } from '../domain/enums/trade-request-status.enum';
import { TradeRequestEntity } from '../infrastructure/entities/trade-request.entity';

export class MatchBuyOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @MinLength(36)
  @MaxLength(36)
  sellOrderId!: string;

  @ApiProperty({ enum: BuyMatchType })
  @IsEnum(BuyMatchType)
  expectedMatchType!: BuyMatchType;

  @ApiProperty({
    description: '후보 조회 시점의 판매 remaining (bigint string)',
    example: '500000',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[1-9]\d*$/)
  expectedCoinAmount!: string;
}

export class MatchResultDto {
  @ApiProperty({ enum: BuyMatchType })
  type!: BuyMatchType;

  @ApiProperty({ description: 'bigint string' })
  coinAmount!: string;
}

export class MatchBuyOrderResponseDto {
  @ApiProperty()
  buyOrderId!: string;

  @ApiProperty()
  tradeId!: string;

  @ApiProperty({ type: MatchResultDto })
  match!: MatchResultDto;

  @ApiProperty({ enum: TradeStatus })
  tradeStatus!: TradeStatus;
}

export class ApplyBuyOrderResponseDto {
  @ApiProperty()
  tradeRequestId!: string;

  @ApiProperty()
  buyOrderId!: string;

  @ApiProperty({ enum: TradeRequestStatus })
  status!: TradeRequestStatus;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ type: MatchResultDto })
  match!: MatchResultDto;

  static from(request: TradeRequestEntity): ApplyBuyOrderResponseDto {
    const dto = new ApplyBuyOrderResponseDto();
    dto.tradeRequestId = request.id;
    dto.buyOrderId = request.buyOrderId;
    dto.status = request.status;
    dto.expiresAt = request.expiresAt;
    dto.match = {
      type: request.matchType,
      coinAmount: request.requestedCoinAmount,
    };
    return dto;
  }
}

export class AcceptTradeRequestResponseDto {
  @ApiProperty()
  tradeRequestId!: string;

  @ApiProperty()
  tradeId!: string;

  @ApiProperty({ enum: TradeStatus })
  tradeStatus!: TradeStatus;

  @ApiProperty({ type: MatchResultDto })
  match!: MatchResultDto;
}

export class RejectTradeRequestDto {
  @ApiProperty({ enum: TradeRequestRejectionReason })
  @IsEnum(TradeRequestRejectionReason)
  reasonCode!: TradeRequestRejectionReason;
}

export class TradeRequestResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buyOrderId!: string;

  @ApiProperty()
  sellOrderId!: string;

  @ApiProperty({ enum: TradeRequestStatus })
  status!: TradeRequestStatus;

  @ApiProperty({ type: MatchResultDto })
  match!: MatchResultDto;

  @ApiProperty()
  expiresAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  tradeId!: string | null;

  @ApiPropertyOptional({
    enum: TradeRequestRejectionReason,
    nullable: true,
  })
  rejectionReasonCode!: TradeRequestRejectionReason | null;

  static from(
    request: TradeRequestEntity,
    tradeId: string | null,
  ): TradeRequestResponseDto {
    const dto = new TradeRequestResponseDto();
    dto.id = request.id;
    dto.buyOrderId = request.buyOrderId;
    dto.sellOrderId = request.sellOrderId;
    dto.status = request.status;
    dto.match = {
      type: request.matchType,
      coinAmount: request.requestedCoinAmount,
    };
    dto.expiresAt = request.expiresAt;
    dto.tradeId = tradeId;
    dto.rejectionReasonCode = request.rejectionReasonCode;
    return dto;
  }
}

export class MatchingStatusTradeRequestDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TradeRequestStatus })
  status!: TradeRequestStatus;

  @ApiProperty()
  expiresAt!: Date;
}

export class CandidateSellerDto {
  @ApiProperty()
  nicknameMasked!: string;

  @ApiProperty()
  completedTradeCount!: number;
}

export class MatchingCandidateItemDto {
  @ApiProperty()
  sellOrderId!: string;

  @ApiProperty({ enum: BuyMatchType })
  matchType!: BuyMatchType;

  @ApiProperty({ description: '판매 remaining (bigint string)' })
  coinAmount!: string;

  @ApiProperty({
    description: 'buy 요청액 대비 차이 (sell - buy, bigint string)',
  })
  differenceAmount!: string;

  @ApiProperty({ type: CandidateSellerDto })
  seller!: CandidateSellerDto;

  @ApiProperty()
  createdAt!: Date;
}

export class CandidateBuyOrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: BuyOrderStatus })
  status!: BuyOrderStatus;

  @ApiProperty({ description: 'bigint string' })
  requestedCoinAmount!: string;
}

export class CandidateSummaryDto {
  @ApiProperty()
  exactCount!: number;

  @ApiProperty()
  nearCount!: number;

  @ApiProperty()
  updatedAt!: Date;
}

export class MatchingCandidatesResponseDto {
  @ApiProperty({ type: CandidateBuyOrderDto })
  buyOrder!: CandidateBuyOrderDto;

  @ApiProperty({ type: CandidateSummaryDto })
  summary!: CandidateSummaryDto;

  @ApiProperty({ type: [MatchingCandidateItemDto] })
  candidates!: MatchingCandidateItemDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;
}

export class SearchMatchingCandidatesDto {
  @ApiProperty({ enum: BuyMatchType })
  @IsEnum(BuyMatchType)
  type!: BuyMatchType;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'keyset cursor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;
}

export class MatchingStatusCandidateSummaryDto {
  @ApiProperty()
  exactCount!: number;

  @ApiProperty()
  nearCount!: number;
}

export class MatchingStatusResponseDto {
  @ApiProperty()
  buyOrderId!: string;

  /** @deprecated use buyOrderId */
  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: BuyOrderStatus })
  status!: BuyOrderStatus;

  /** @deprecated Browse+Select에서는 rematch 횟수가 아님 */
  @ApiProperty()
  attemptCount!: number;

  @ApiProperty()
  matched!: boolean;

  @ApiPropertyOptional({ nullable: true })
  tradeId!: string | null;

  @ApiPropertyOptional({
    type: MatchingStatusCandidateSummaryDto,
    nullable: true,
  })
  candidateSummary!: MatchingStatusCandidateSummaryDto | null;

  @ApiPropertyOptional({
    type: MatchingStatusTradeRequestDto,
    nullable: true,
  })
  tradeRequest!: MatchingStatusTradeRequestDto | null;
}
