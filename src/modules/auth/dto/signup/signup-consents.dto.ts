import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

import { ConsentType } from '../../../users/domain/enums/consent-type.enum';

export class SignupConsentItemDto {
  @IsEnum(ConsentType)
  consentType!: ConsentType;

  @IsString()
  @IsNotEmpty()
  @Length(1, 30)
  documentVersion!: string;

  @IsBoolean()
  isAgreed!: boolean;
}

export class SignupConsentsDto {
  @ValidateNested({ each: true })
  @Type(() => SignupConsentItemDto)
  @ArrayMinSize(4)
  items!: SignupConsentItemDto[];

  @IsDateString()
  agreedAt!: string;
}

/** 가입 필수 동의 타입 (MARKETING 제외) */
export const REQUIRED_SIGNUP_CONSENT_TYPES: ConsentType[] = [
  ConsentType.SERVICE,
  ConsentType.PRIVACY,
  ConsentType.UNIQUE_IDENTIFIER,
  ConsentType.BANK_ACCOUNT,
];

export function assertRequiredConsentsAgreed(
  items: SignupConsentItemDto[],
): boolean {
  return REQUIRED_SIGNUP_CONSENT_TYPES.every((type) =>
    items.some((item) => item.consentType === type && item.isAgreed === true),
  );
}

/** 동일 consentType + documentVersion 중복 여부 */
export function hasDuplicateConsentKeys(
  items: SignupConsentItemDto[],
): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.consentType}:${item.documentVersion}`;
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}
