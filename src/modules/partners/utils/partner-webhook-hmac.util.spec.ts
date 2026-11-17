import {
  signWebhookPayload,
  verifyWebhookSignature,
} from './partner-webhook-hmac.util';

describe('partner-webhook-hmac.util', () => {
  const secret = 'whsec_test';
  const timestamp = '1700000000';
  const rawBody = '{"eventId":"evt-1","event":"MERCHANT_PAYMENT_COMPLETED"}';

  it('signs and verifies', () => {
    const signature = signWebhookPayload(secret, timestamp, rawBody);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody,
        signatureHex: signature,
      }),
    ).toBe(true);
  });

  it('rejects tampered body', () => {
    const signature = signWebhookPayload(secret, timestamp, rawBody);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody: rawBody + 'x',
        signatureHex: signature,
      }),
    ).toBe(false);
  });
});
