import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateBankDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  iconKey?: string | null;

  @ApiPropertyOptional({ example: 'shinhan.svg' })
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(/^[a-z0-9_-]+\.svg$/i)
  @MaxLength(255)
  svgFilename?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  dailyMaintenanceStart?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  dailyMaintenanceEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  regularMaintenanceRule?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maintenanceNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ example: '정기 점검 안내 변경' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
