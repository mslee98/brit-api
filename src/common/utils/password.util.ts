import * as bcrypt from 'bcrypt';

/** 로그인 비밀번호·거래 PIN 해시에 쓰는 bcrypt rounds */
export const BCRYPT_ROUNDS = 12;

/** 로그인 비밀번호 해시 (password_hash) */
export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifySecret(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * 거래 PIN 해시 (user_profiles.pin_hash).
 * pepper + pin을 합쳐 bcrypt. env: TRANSACTION_PIN_PEPPER
 */
export async function hashTransactionPin(
  pin: string,
  pepper: string,
): Promise<string> {
  return hashSecret(`${pepper}:${pin}`);
}

export async function verifyTransactionPin(
  pin: string,
  pepper: string,
  hash: string,
): Promise<boolean> {
  return verifySecret(`${pepper}:${pin}`, hash);
}
