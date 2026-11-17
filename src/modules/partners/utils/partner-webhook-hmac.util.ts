import { createHmac, timingSafeEqual } from 'crypto';

/**
 * BRIT → 업체 Webhook HMAC-SHA256.
 * signedPayload = `${timestamp}.${rawBody}`
 */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signatureHex: string;
}): boolean {
  const expected = signWebhookPayload(
    input.secret,
    input.timestamp,
    input.rawBody,
  );
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signatureHex, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
