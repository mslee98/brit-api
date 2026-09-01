import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

import { UserRole } from '../../users/domain/enums/user-role.enum';

export class RevokeAdminRoleDto {
  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.SYS_ADMIN] })
  @IsEnum(UserRole)
  role!: UserRole.ADMIN | UserRole.SYS_ADMIN;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;
}
