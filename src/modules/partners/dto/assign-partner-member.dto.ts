import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PartnerMemberRole } from '../domain/enums/partner-member-role.enum';

export class AssignPartnerMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: PartnerMemberRole })
  @IsEnum(PartnerMemberRole)
  role!: PartnerMemberRole;

  @ApiPropertyOptional({ example: '초기 OWNER 지정' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
