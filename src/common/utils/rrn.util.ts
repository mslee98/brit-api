import { GenderCode } from '../../modules/users/domain/enums/gender-code.enum';

export type ParsedRrnFront7 = {
  birthDate: string;
  genderCode: GenderCode;
};

/**
 * 주민등록번호 앞 7자리 → 생년월일(YYYY-MM-DD) + 성별.
 * 7번째 자리: 1,3,5,7 = 남 / 2,4,6,8 = 여
 * 1,2 → 1900년대 / 3,4 → 2000년대 / 5,6 → 1900(외국인) / 7,8 → 2000(외국인)
 */
export function parseRrnFront7(rrnFront7: string): ParsedRrnFront7 {
  if (!/^\d{7}$/.test(rrnFront7)) {
    throw new Error('INVALID_RRN');
  }

  const yy = Number(rrnFront7.slice(0, 2));
  const mm = Number(rrnFront7.slice(2, 4));
  const dd = Number(rrnFront7.slice(4, 6));
  const genderDigit = Number(rrnFront7[6]);

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

  return { birthDate, genderCode };
}
