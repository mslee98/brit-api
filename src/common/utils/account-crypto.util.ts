/**
 * 계좌번호 암호화·해시·마스킹.
 *
 * - encrypt → user_bank_accounts.account_number_encrypted (BYTEA)
 * - hash → account_number_hash (중복 검사용 HMAC hex 64자)
 * - mask → 목록/응답 표시용 (원문·암호문 노출 금지)
 *
 * env: ACCOUNT_ENCRYPTION_KEY, IDENTITY_PEPPER(해시용)
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const AES_KEY_LENGTH = 32;

function resolveAesKey(keyMaterial: string): Buffer {
  const buf = Buffer.from(keyMaterial, keyMaterial.length === 64 ? 'hex' : 'utf8');
  if (buf.length === AES_KEY_LENGTH) {
    return buf;
  }
  // 개발 편의: 길이가 다르면 SHA-256으로 32바이트 키 유도
  return createHmac('sha256', 'account-key-derivation').update(keyMaterial).digest();
}

/**
 * AES-256-GCM 암호화. BYTEA 저장 형식: iv(12) + tag(16) + ciphertext
 */
export function encryptAccountNumber(
  accountNumber: string,
  encryptionKey: string,
): Buffer {
  const key = resolveAesKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(accountNumber, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptAccountNumber(
  encryptedPayload: Buffer,
  encryptionKey: string,
): string {
  if (encryptedPayload.length < 28) {
    throw new Error('INVALID_ACCOUNT_CIPHERTEXT');
  }
  const iv = encryptedPayload.subarray(0, 12);
  const tag = encryptedPayload.subarray(12, 28);
  const data = encryptedPayload.subarray(28);
  const key = resolveAesKey(encryptionKey);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export function hashAccountNumber(
  accountNumber: string,
  pepper: string,
): string {
  return createHmac('sha256', pepper).update(accountNumber).digest('hex');
}

/**
 * 표시용 마스킹. 예: 3333012345673 → 3333-**-******3
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length < 5) {
    return '****';
  }
  const head = digits.slice(0, 4);
  const tail = digits.slice(-1);
  const middleLen = Math.max(digits.length - 5, 2);
  return `${head}-**-${'*'.repeat(Math.min(middleLen, 6))}${tail}`;
}
