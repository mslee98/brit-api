import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { GenderCode } from '../domain/enums/gender-code.enum';
import { MobileCarrier } from '../domain/enums/mobile-carrier.enum';
import { UserStatus } from '../domain/enums/user-status.enum';

export class AdminUserListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  loginId!: string;

  @ApiProperty()
  phoneE164!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty()
  registrationSubmittedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  nickname!: string | null;
}

export class AdminUserDetailDto extends AdminUserListItemDto {
  @ApiProperty({ description: '마스킹된 주민등록번호' })
  residentRegistrationNumberMasked!: string;

  @ApiProperty()
  birthDate!: string;

  @ApiProperty({ enum: GenderCode })
  genderCode!: GenderCode;

  @ApiProperty({ enum: MobileCarrier })
  mobileCarrier!: MobileCarrier;

  @ApiPropertyOptional({ nullable: true })
  approvedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  approvedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  rejectedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectionReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  suspendedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  suspensionReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  suspendedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  withdrawnAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  withdrawalReason!: string | null;
}
