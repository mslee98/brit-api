/**
 * 한국 휴대폰 번호를 E.164(+82…)로 정규화한다.
 * 예: 01012345678 → +821012345678
 */
export function toPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.startsWith('82') && digits.length >= 11) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
    return `+82${digits.slice(1)}`;
  }

  throw new Error('INVALID_PHONE');
}
