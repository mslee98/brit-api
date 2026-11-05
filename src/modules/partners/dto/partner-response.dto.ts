import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PartnerMemberRole } from '../domain/enums/partner-member-role.enum';
import { PartnerMemberStatus } from '../domain/enums/partner-member-status.enum';
import { PartnerStatus } from '../domain/enums/partner-status.enum';
import { PartnerEntity } from '../infrastructure/entities/partner.entity';
import { PartnerMemberEntity } from '../infrastructure/entities/partner-member.entity';

export class PartnerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PartnerStatus })
  status!: PartnerStatus;

  @ApiProperty()
  contactName!: string;

  @ApiProperty()
  contactPhone!: string;

  @ApiProperty()
  contactEmail!: string;

  @ApiPropertyOptional({ nullable: true })
  contactTelegram!: string | null;

  @ApiPropertyOptional({ nullable: true })
  memo!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  static from(entity: PartnerEntity): PartnerResponseDto {
    const dto = new PartnerResponseDto();
    dto.id = entity.id;
    dto.code = entity.code;
    dto.name = entity.name;
    dto.status = entity.status;
    dto.contactName = entity.contactName;
    dto.contactPhone = entity.contactPhone;
    dto.contactEmail = entity.contactEmail;
    dto.contactTelegram = entity.contactTelegram;
    dto.memo = entity.memo;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

export class PartnerMemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  partnerId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  loginId!: string;

  @ApiPropertyOptional({ nullable: true })
  nickname!: string | null;

  @ApiPropertyOptional({ nullable: true })
  realName!: string | null;

  @ApiProperty({ enum: PartnerMemberRole })
  role!: PartnerMemberRole;

  @ApiProperty({ enum: PartnerMemberStatus })
  status!: PartnerMemberStatus;

  @ApiPropertyOptional({ nullable: true })
  joinedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  removedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  static from(
    entity: PartnerMemberEntity,
    user?: {
      loginId: string;
      nickname: string | null;
      realName: string | null;
    },
  ): PartnerMemberResponseDto {
    const dto = new PartnerMemberResponseDto();
    dto.id = entity.id;
    dto.partnerId = entity.partnerId;
    dto.userId = entity.userId;
    dto.loginId = user?.loginId ?? entity.user?.loginId ?? '';
    dto.nickname =
      user?.nickname ?? entity.user?.profile?.nickname ?? null;
    dto.realName =
      user?.realName ?? entity.user?.profile?.name ?? null;
    dto.role = entity.role;
    dto.status = entity.status;
    dto.joinedAt = entity.joinedAt?.toISOString() ?? null;
    dto.removedAt = entity.removedAt?.toISOString() ?? null;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
