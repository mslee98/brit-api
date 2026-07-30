import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { SignupBankAccountDto } from './signup-bank-account.dto';
import { SignupConsentsDto } from './signup-consents.dto';
import { SignupCredentialsDto } from './signup-credentials.dto';
import { SignupIdentityDto } from './signup-identity.dto';
import { SignupSecurityDto } from './signup-security.dto';

/**
 * POST /auth/signup 요청 루트.
 *
 * 구조: identity / credentials / bankAccount / security / consents
 * 선행: POST /auth/accounts/verify → bankAccount.accountVerifyToken
 *
 * 필수 동의: SERVICE, PRIVACY, UNIQUE_IDENTIFIER, BANK_ACCOUNT (isAgreed=true)
 * nickname은 선택. RRN은 000000-0000000. pin은 숫자 6자리.
 */
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
  @Type(() => SignupConsentsDto)
  consents!: SignupConsentsDto;
}

export {
  assertRequiredConsentsAgreed,
  hasDuplicateConsentKeys,
  REQUIRED_SIGNUP_CONSENT_TYPES,
  SignupConsentItemDto,
  SignupConsentsDto,
} from './signup-consents.dto';
export { SignupBankAccountDto } from './signup-bank-account.dto';
export { SignupCredentialsDto } from './signup-credentials.dto';
export { SignupIdentityDto } from './signup-identity.dto';
export { SignupSecurityDto } from './signup-security.dto';
