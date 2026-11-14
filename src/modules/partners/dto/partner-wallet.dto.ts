import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

import type { PartnerWalletSummary } from '../partner-coin.service';

export class UpdatePartnerCreditLimitDto {
  @ApiProperty({
    example: '500000',
    description:
      '마이너스 한도 (MS 최소단위, 0 이상 정수 문자열). 0이면 음수 잔액 불가',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d*)$/)
  creditLimit!: string;

  @ApiPropertyOptional({ example: '정산 보증금 확인' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class PartnerWalletResponseDto {
  @ApiProperty({ example: '-30000' })
  availableBalance!: string;

  @ApiProperty({ example: '0' })
  lockedBalance!: string;

  @ApiProperty({ example: '500000' })
  creditLimit!: string;

  @ApiProperty({
    example: '470000',
    description: '추가로 REDEEM 가능한 금액 (available + creditLimit)',
  })
  remainingCredit!: string;

  static from(summary: PartnerWalletSummary): PartnerWalletResponseDto {
    return Object.assign(new PartnerWalletResponseDto(), summary);
  }
}
