import { PartnerClientEnvironment } from '../domain/enums/partner-client-environment.enum';

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.0\.0\.0|::1|\[::1\])/i;

/**
 * Webhook URL SSRF 가드.
 * SANDBOX만 http + localhost/사설 IP 허용. PRODUCTION은 https + 공인 호스트.
 */
export function assertSafeWebhookUrl(
  raw: string,
  environment: PartnerClientEnvironment,
): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('INVALID_WEBHOOK_URL');
  }

  if (url.username || url.password) {
    throw new Error('WEBHOOK_URL_CREDENTIALS_FORBIDDEN');
  }

  if (environment === PartnerClientEnvironment.PRODUCTION) {
    if (url.protocol !== 'https:') {
      throw new Error('WEBHOOK_URL_HTTPS_REQUIRED');
    }
    if (PRIVATE_HOST_RE.test(url.hostname)) {
      throw new Error('WEBHOOK_URL_PRIVATE_HOST_FORBIDDEN');
    }
  } else {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('WEBHOOK_URL_SCHEME_INVALID');
    }
  }

  return url;
}
