import { ApiProperty } from '@nestjs/swagger';

export class AdminOpsSummaryDto {
  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ description: '완료·취소가 아닌 거래 수' })
  ongoingTrades!: number;

  @ApiProperty({ description: '해결·취소가 아닌 분쟁 수' })
  openDisputes!: number;

  @ApiProperty({ description: '담당자가 없는 분쟁 수' })
  unassignedDisputes!: number;

  @ApiProperty({ description: '가입 승인 대기 사용자 수' })
  pendingRegistrations!: number;

  @ApiProperty({ description: '입금 확인 전 충전 요청 수' })
  pendingCoinPurchases!: number;
}
