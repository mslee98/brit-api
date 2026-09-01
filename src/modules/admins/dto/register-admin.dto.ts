import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import { UserRole } from '../../users/domain/enums/user-role.enum';

export class RegisterAdminDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.SYS_ADMIN] })
  @IsEnum(UserRole)
  role!: UserRole.ADMIN | UserRole.SYS_ADMIN;

  @ApiProperty({ minimum: 1, maximum: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  adminLevel!: number;

  @ApiProperty()
  @IsBoolean()
  isLeader!: boolean;

  @ApiProperty()
  @IsBoolean()
  canViewRevenue!: boolean;

  @ApiProperty()
  @IsBoolean()
  canViewFullIdentity!: boolean;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;
}
