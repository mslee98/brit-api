import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * BRIT → 업체 Operations 요청 HMAC-SHA256.
 * canonical = METHOD \\n path+query \\n timestamp \\n requestId \\n sha256(rawBody)
 */
export function buildOperationsCanonical(input: {
  method: string;
  pathWithQuery: string;
  timestamp: string;
  requestId: string;
  rawBody: string;
}): string {
  const bodyHash = createHash('sha256').update(input.rawBody, 'utf8').digest('hex');
  return [
    input.method.toUpperCase(),
    input.pathWithQuery,
    input.timestamp,
    input.requestId,
    bodyHash,
  ].join('\n');
}

export function signOperationsRequest(
  secret: string,
  canonical: string,
): string {
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function verifyOperationsSignature(input: {
  secret: string;
  canonical: string;
  signatureHex: string;
}): boolean {
  const expected = signOperationsRequest(input.secret, input.canonical);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signatureHex, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashOperationsRequestBody(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}
