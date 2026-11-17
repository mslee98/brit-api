import {
  buildOperationsCanonical,
  signOperationsRequest,
  verifyOperationsSignature,
} from './partner-operations-hmac.util';

describe('partner-operations-hmac', () => {
  it('signs and verifies canonical payload', () => {
    const canonical = buildOperationsCanonical({
      method: 'POST',
      pathWithQuery: '/brit/operations',
      timestamp: '1700000000',
      requestId: 'req-1',
      rawBody: '{"exchangeId":"ex-1"}',
    });
    const secret = 'test-secret';
    const sig = signOperationsRequest(secret, canonical);
    expect(
      verifyOperationsSignature({
        secret,
        canonical,
        signatureHex: sig,
      }),
    ).toBe(true);
    expect(
      verifyOperationsSignature({
        secret,
        canonical,
        signatureHex: '00' + sig.slice(2),
      }),
    ).toBe(false);
  });
});
