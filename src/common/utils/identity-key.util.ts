import { createHmac } from 'crypto';

import { GenderCode } from '../../modules/users/domain/enums/gender-code.enum';

/**
 * 동일인 중복 가입 방지용 HMAC-SHA256 해시 (hex 64자).
 */
export function hashIdentityKey(params: {
  pepper: string;
  name: string;
  birthDate: string;
  genderCode: GenderCode;
}): string {
  const payload = [
    params.name.trim(),
    params.birthDate,
    params.genderCode,
  ].join('|');

  return createHmac('sha256', params.pepper).update(payload).digest('hex');
}
