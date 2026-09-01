import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, Length } from 'class-validator';

export class UpdateAdminPermissionsDto {
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
