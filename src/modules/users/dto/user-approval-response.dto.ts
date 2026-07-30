import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MobileCarrier } from '../domain/enums/mobile-carrier.enum';
import { GenderCode } from '../domain/enums/gender-code.enum';
import { UserBankAccountStatus } from '../domain/enums/user-bank-account-status.enum';
import { UserStatus } from '../domain/enums/user-status.enum';

export class UserApprovalBankAccountDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  bankCode!: string;

  @ApiProperty()
  accountNumberMasked!: string;

  @ApiProperty()
  holderName!: string;

  @ApiProperty({ enum: UserBankAccountStatus })
  status!: UserBankAccountStatus;
}

export class UserApprovalListItemDto {
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

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  nickname!: string | null;

  @ApiPropertyOptional({ type: UserApprovalBankAccountDto, nullable: true })
  bankAccount!: UserApprovalBankAccountDto | null;
}

export class UserApprovalDetailDto extends UserApprovalListItemDto {
  @ApiProperty({ description: '마스킹된 주민등록번호 (앞 6자리 + *******)' })
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
}
