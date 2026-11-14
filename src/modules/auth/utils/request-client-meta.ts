import type { Request } from 'express';

/** 프록시 뒤 IP · User-Agent 추출 (세션 목록 표시용). */
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  const ip = req.ip?.trim();
  return ip && ip.length > 0 ? ip : null;
}

export function extractUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string' && ua.trim()) {
    return ua.trim().slice(0, 512);
  }
  return null;
}
