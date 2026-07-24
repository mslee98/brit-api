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
 * AES-256-GCM 암호화. 저장 형식: base64(iv).base64(tag).base64(ciphertext)
 */
export function encryptAccountNumber(
  accountNumber: string,
  encryptionKey: string,
): string {
  const key = resolveAesKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(accountNumber, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptAccountNumber(
  encryptedPayload: string,
  encryptionKey: string,
): string {
  const [ivB64, tagB64, dataB64] = encryptedPayload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('INVALID_ACCOUNT_CIPHERTEXT');
  }
  const key = resolveAesKey(encryptionKey);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
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
