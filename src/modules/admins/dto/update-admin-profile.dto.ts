import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateAdminProfileDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  adminLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLeader?: boolean;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;
}
