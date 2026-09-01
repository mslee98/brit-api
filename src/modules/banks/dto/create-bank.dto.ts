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

export class CreateBankDto {
  @ApiProperty({ example: '088' })
  @IsString()
  @Length(2, 20)
  code!: string;

  @ApiProperty({ example: '신한은행' })
  @IsString()
  @Length(1, 50)
  name!: string;

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

  @ApiPropertyOptional({ example: '23:50' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  dailyMaintenanceStart?: string | null;

  @ApiPropertyOptional({ example: '00:10' })
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

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ example: '신규 지원 은행 등록' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
