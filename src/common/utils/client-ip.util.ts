import type { Request } from 'express';

/** X-Forwarded-For 우선, 없으면 req.ip. 감사 로그용. */
export function resolveClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
