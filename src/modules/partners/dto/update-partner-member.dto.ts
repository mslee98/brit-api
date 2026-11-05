import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

import { PartnerMemberRole } from '../domain/enums/partner-member-role.enum';

export class UpdatePartnerMemberDto {
  @ApiProperty({ enum: PartnerMemberRole })
  @IsEnum(PartnerMemberRole)
  role!: PartnerMemberRole;

  @ApiProperty({ example: '역할 변경' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
