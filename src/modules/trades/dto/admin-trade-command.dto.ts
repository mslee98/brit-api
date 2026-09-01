import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminTradeReasonDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AdminOpenDisputeDto {
  @ApiProperty({ example: 'PAYMENT_CONFIRMATION_REQUIRED' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  reasonCode!: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
