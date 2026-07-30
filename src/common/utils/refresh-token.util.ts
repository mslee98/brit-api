import { createHash, randomBytes } from 'crypto';

/**
 * Refresh Token 유틸.
 * - generate: 클라이언트에만 원문 전달
 * - hash: user_sessions.refresh_token_hash에 SHA-256 저장 (원문 미저장)
 */
export function generateRefreshToken(): string {
  return `rt_${randomBytes(32).toString('base64url')}`;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
