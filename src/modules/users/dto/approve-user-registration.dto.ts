import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveUserRegistrationDto {
  @ApiProperty({ description: '신원(주민번호·실명) 확인 여부' })
  @IsBoolean()
  identityChecked!: boolean;

  @ApiProperty({ description: '전화번호 확인 여부' })
  @IsBoolean()
  phoneChecked!: boolean;

  @ApiProperty({ description: '계좌 정보 확인 여부' })
  @IsBoolean()
  bankAccountChecked!: boolean;

  @ApiProperty({ description: '예금주명 일치 확인 여부' })
  @IsBoolean()
  holderNameMatched!: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewReason?: string;
}

export class RejectUserRegistrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  identityChecked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  phoneChecked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bankAccountChecked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  holderNameMatched?: boolean;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rejectionReason!: string;
}
