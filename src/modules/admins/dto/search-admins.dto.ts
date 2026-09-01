import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserRole } from '../../users/domain/enums/user-role.enum';

export class SearchAdminsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Type(() => String)
  keyword?: string;

  @ApiPropertyOptional({ enum: [UserRole.ADMIN, UserRole.SYS_ADMIN] })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole.ADMIN | UserRole.SYS_ADMIN;

  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  adminLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isLeader?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
