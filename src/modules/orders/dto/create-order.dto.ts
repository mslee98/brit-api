import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({
    description: '주문 Coin 금액 (양의 정수 문자열)',
    example: '500000',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[1-9]\d*$/, { message: 'coinAmount must be a positive integer' })
  coinAmount!: string;
}
