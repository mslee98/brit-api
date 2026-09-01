import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { CoinBalanceType } from '../domain/enums/coin-balance-type.enum';

/** 양의 정수 금액 문자열 (bigint) */
const POSITIVE_AMOUNT = /^[1-9]\d*$/;
const POSITIVE_AMOUNT_MESSAGE = '금액은 양의 정수 문자열이어야 해요.';

export class AdminCreditCoinDto {
  @ApiProperty({
    example: '10000',
    description: '지급 금액 (양의 정수 문자열, bigint)',
  })
  @IsString()
  @Matches(POSITIVE_AMOUNT, { message: POSITIVE_AMOUNT_MESSAGE })
  amount!: string;

  @ApiProperty({
    example: false,
    description: 'true면 판매 가능 Coin. SYS_ADMIN만 허용',
  })
  @IsBoolean()
  sellable!: boolean;

  @ApiProperty({ example: '시스템 오류 보정', maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class AdminDebitCoinDto {
  @ApiProperty({
    example: '10000',
    description: '차감 금액 (양의 정수 문자열, bigint)',
  })
  @IsString()
  @Matches(POSITIVE_AMOUNT, { message: POSITIVE_AMOUNT_MESSAGE })
  amount!: string;

  @ApiProperty({
    enum: CoinBalanceType,
    description: '차감할 잔액 구분. 해당 is_sellable Lot만 FIFO 소비',
  })
  @IsEnum(CoinBalanceType)
  balanceType!: CoinBalanceType;

  @ApiProperty({ example: '중복 지급 보정', maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class CreateCoinPurchaseDto {
  @ApiProperty({
    example: '100000',
    description: '구매 금액 (양의 정수 문자열, bigint)',
  })
  @IsString()
  @Matches(POSITIVE_AMOUNT, { message: POSITIVE_AMOUNT_MESSAGE })
  amount!: string;
}
