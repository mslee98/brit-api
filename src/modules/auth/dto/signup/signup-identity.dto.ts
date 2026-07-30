import { IsEnum, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { MobileCarrier } from '../../../users/domain/enums/mobile-carrier.enum';

/** 실명·주민번호·통신사·전화 */
export class SignupIdentityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsString()
  @Matches(/^[0-9]{6}-[0-9]{7}$/)
  residentRegistrationNumber!: string;

  @IsEnum(MobileCarrier)
  mobileCarrier!: MobileCarrier;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}
