import { createHash, randomBytes } from 'crypto';

export function generateRefreshToken(): string {
  return `rt_${randomBytes(32).toString('base64url')}`;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
