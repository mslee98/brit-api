import { GenderCode } from '../domain/enums/gender-code.enum';

/**
 * 주민등록번호 정규화·파생 (Users 도메인 유틸).
 * 클라이언트는 전체 RRN만 보내고, birth_date/gender_code는 여기서 만든다.
 * 로그에 평문 RRN을 남기지 말 것.
 */
export type ParsedRrn = {
  residentRegistrationNumber: string;
  birthDate: string;
  genderCode: GenderCode;
};

const RRN_PATTERN = /^[0-9]{6}-[0-9]{7}$/;

/**
 * 하이픈 유무와 무관하게 000000-0000000 형식으로 정규화한다.
 */
export function normalizeResidentRegistrationNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 13) {
    throw new Error('INVALID_RRN');
  }
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/**
 * 전체 주민등록번호(000000-0000000)를 정규화하고 생년월일·성별을 파생한다.
 * 7번째 자리(하이픈 뒤 첫 자리): 1,3,5,7 = 남 / 2,4,6,8 = 여
 * 1,2 → 1900년대 / 3,4 → 2000년대 / 5,6 → 1900(외국인) / 7,8 → 2000(외국인)
 */
export function parseResidentRegistrationNumber(raw: string): ParsedRrn {
  const residentRegistrationNumber = normalizeResidentRegistrationNumber(raw);
  if (!RRN_PATTERN.test(residentRegistrationNumber)) {
    throw new Error('INVALID_RRN');
  }

  const digits = residentRegistrationNumber.replace('-', '');
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const genderDigit = Number(digits[6]);

  let century: number;
  let genderCode: GenderCode;

  switch (genderDigit) {
    case 1:
    case 5:
      century = 1900;
      genderCode = GenderCode.MALE;
      break;
    case 2:
    case 6:
      century = 1900;
      genderCode = GenderCode.FEMALE;
      break;
    case 3:
    case 7:
      century = 2000;
      genderCode = GenderCode.MALE;
      break;
    case 4:
    case 8:
      century = 2000;
      genderCode = GenderCode.FEMALE;
      break;
    default:
      throw new Error('INVALID_RRN');
  }

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    throw new Error('INVALID_RRN');
  }

  const year = century + yy;
  const birthDate = `${year.toString().padStart(4, '0')}-${mm
    .toString()
    .padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;

  return { residentRegistrationNumber, birthDate, genderCode };
}
