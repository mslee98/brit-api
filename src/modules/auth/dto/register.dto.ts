import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ConsentType } from '../../users/domain/enums/consent-type.enum';
import { MobileCarrier } from '../../users/domain/enums/mobile-carrier.enum';

export class RegisterConsentDto {
  @IsEnum(ConsentType)
  type!: ConsentType;

  @IsString()
  @Length(1, 30)
  version!: string;

  @IsBoolean()
  agreed!: boolean;
}

export class RegisterDto {
  @IsString()
  @Length(4, 30)
  loginId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsString()
  @Length(2, 50)
  name!: string;

  @Matches(/^\d{6}-\d{7}$/)
  residentRegistrationNumber!: string;

  @IsEnum(MobileCarrier)
  mobileCarrier!: MobileCarrier;

  @Matches(/^01[016789]\d{7,8}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(2, 30)
  nickname?: string;

  @IsString()
  @MaxLength(20)
  bankCode!: string;

  @IsString()
  bankAccountNumber!: string;

  @IsString()
  @Length(2, 50)
  bankAccountHolderName!: string;

  @Matches(/^\d{6}$/)
  pin!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RegisterConsentDto)
  consents!: RegisterConsentDto[];
}
