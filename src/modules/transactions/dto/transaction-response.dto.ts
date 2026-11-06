import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TransactionKind } from '../domain/enums/transaction-kind.enum';
import { TransactionStatus } from '../domain/enums/transaction-status.enum';

export class TransactionItemDto {
  @ApiProperty({ example: 'trade-3f1c…', description: '`출처-uuid` 형식' })
  id!: string;

  @ApiProperty({ enum: TransactionKind })
  kind!: TransactionKind;

  @ApiProperty({ enum: ['IN', 'OUT'] })
  direction!: 'IN' | 'OUT';

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({
    example: '600000',
    description: 'Coin 수량 절댓값 (string bigint)',
  })
  coinAmount!: string;

  @ApiPropertyOptional({ nullable: true, description: 'P2P 거래 원화 금액' })
  cashAmount!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '업체 충전·환전 포인트 수량',
  })
  pointAmount!: string | null;

  @ApiProperty({ description: '끝난 시각. 진행 중이면 시작 시각' })
  occurredAt!: string;

  @ApiProperty()
  requestedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: '거래번호·전환번호' })
  referenceNumber!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'P2P 거래면 거래 화면 이동용',
  })
  tradeId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '테**' })
  counterpartyNickname!: string | null;

  @ApiPropertyOptional({ nullable: true })
  partnerName!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'ABC 포인트' })
  assetName!: string | null;
}

export class TransactionListResponseDto {
  @ApiProperty({ type: [TransactionItemDto] })
  items!: TransactionItemDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;
}

export class TransactionTimelineStepDto {
  @ApiProperty({
    enum: [
      'REQUESTED',
      'PAYMENT_REPORTED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'FAILED',
    ],
  })
  step!:
    | 'REQUESTED'
    | 'PAYMENT_REPORTED'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'FAILED';

  @ApiProperty()
  at!: string;
}

export class TransactionDetailDto extends TransactionItemDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'P2P 판매자 입금 계좌 은행',
  })
  bankName!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1234-**-****5' })
  accountNumberMasked!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '업체 전환 비율 Coin:Point = numerator:denominator',
  })
  exchangeRate!: { numerator: string; denominator: string } | null;

  @ApiProperty({ type: [TransactionTimelineStepDto] })
  timeline!: TransactionTimelineStepDto[];
}

export class TransactionDaySummaryDto {
  @ApiProperty({ example: '2026-11-07' })
  date!: string;

  @ApiProperty()
  inflow!: string;

  @ApiProperty()
  outflow!: string;

  @ApiProperty({ example: '-350000' })
  net!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ description: '처리 중·확인 중 건이 있는지' })
  hasOpen!: boolean;
}

export class TransactionSummaryResponseDto {
  @ApiProperty({ example: '2026-11' })
  month!: string;

  @ApiProperty({ description: '완료 건 들어온 Coin' })
  inflow!: string;

  @ApiProperty({ description: '완료 건 나간 Coin' })
  outflow!: string;

  @ApiProperty()
  net!: string;

  @ApiProperty({ description: '모든 상태 건수' })
  count!: number;

  @ApiProperty({ description: '처리 중·확인 중 건수' })
  openCount!: number;

  @ApiProperty({ description: '종류별 완료 Coin 합계' })
  byKind!: Record<TransactionKind, string>;

  @ApiProperty({ type: [TransactionDaySummaryDto] })
  byDay!: TransactionDaySummaryDto[];
}
