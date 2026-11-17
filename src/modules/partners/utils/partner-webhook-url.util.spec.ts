import { PartnerClientEnvironment } from '../domain/enums/partner-client-environment.enum';
import { assertSafeWebhookUrl } from './partner-webhook-url.util';

describe('assertSafeWebhookUrl', () => {
  it('allows http localhost in sandbox', () => {
    const url = assertSafeWebhookUrl(
      'http://localhost:5180/brit/webhooks',
      PartnerClientEnvironment.SANDBOX,
    );
    expect(url.hostname).toBe('localhost');
  });

  it('rejects http in production', () => {
    expect(() =>
      assertSafeWebhookUrl(
        'http://example.com/hook',
        PartnerClientEnvironment.PRODUCTION,
      ),
    ).toThrow('WEBHOOK_URL_HTTPS_REQUIRED');
  });

  it('rejects credentials', () => {
    expect(() =>
      assertSafeWebhookUrl(
        'https://user:pass@example.com/hook',
        PartnerClientEnvironment.PRODUCTION,
      ),
    ).toThrow('WEBHOOK_URL_CREDENTIALS_FORBIDDEN');
  });
});
