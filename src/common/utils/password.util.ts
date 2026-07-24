import * as bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS = 12;

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifySecret(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

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
