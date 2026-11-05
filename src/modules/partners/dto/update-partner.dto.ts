import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePartnerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 30)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  contactEmail?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactTelegram?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  @IsString()
  memo?: string | null;

  @ApiProperty({ example: '연락처 수정' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
