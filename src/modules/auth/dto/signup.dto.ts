import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MobileCarrier } from '../../users/domain/enums/mobile-carrier.enum';

export class SignupIdentityDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^\d{7}$/)
  rrnFront7!: string;

  @IsEnum(MobileCarrier)
  mobileCarrier!: MobileCarrier;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class SignupCredentialsDto {
  @IsString()
  @Matches(/^[a-z0-9_]{4,20}$/)
  loginId!: string;

  @IsString()
  @MinLength(8)
  @Length(8, 72)
  loginPassword!: string;

  @IsString()
  @Matches(/^[가-힣a-zA-Z0-9_]{2,12}$/)
  nickname!: string;
}

export class SignupBankAccountDto {
  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @MinLength(10)
  @Matches(/^\d+$/)
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  accountHolderName!: string;

  @IsString()
  @IsNotEmpty()
  accountVerifyToken!: string;
}

export class SignupSecurityDto {
  @IsString()
  @Matches(/^\d{6}$/)
  transactionPin!: string;
}

export class SignupOctomoDto {
  @IsString()
  @IsNotEmpty()
  requestId!: string;

  @IsDateString()
  verifiedAt!: string;
}

export class SignupConsentsDto {
  @IsBoolean()
  @Equals(true)
  service!: boolean;

  @IsBoolean()
  @Equals(true)
  privacy!: boolean;

  @IsBoolean()
  @Equals(true)
  identity!: boolean;

  @IsBoolean()
  marketing!: boolean;

  @IsDateString()
  agreedAt!: string;
}

export class SignupDto {
  @ValidateNested()
  @Type(() => SignupIdentityDto)
  identity!: SignupIdentityDto;

  @ValidateNested()
  @Type(() => SignupCredentialsDto)
  credentials!: SignupCredentialsDto;

  @ValidateNested()
  @Type(() => SignupBankAccountDto)
  bankAccount!: SignupBankAccountDto;

  @ValidateNested()
  @Type(() => SignupSecurityDto)
  security!: SignupSecurityDto;

  @ValidateNested()
  @Type(() => SignupOctomoDto)
  octomo!: SignupOctomoDto;

  @ValidateNested()
  @Type(() => SignupConsentsDto)
  consents!: SignupConsentsDto;
}
