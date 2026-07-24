import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OctomoService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Edge와 동일하게 OCTOMO message/exists를 재호출한다.
   * OCTOMO_STUB=true 이면 로컬 개발용으로 통과시킨다.
   */
  async assertMessageExists(params: {
    phoneDigits: string;
    verifiedAt: Date;
  }): Promise<void> {
    const stub = this.configService.get<string>('OCTOMO_STUB') === 'true';
    if (stub) {
      this.assertVerifiedAtFresh(params.verifiedAt);
      return;
    }

    this.assertVerifiedAtFresh(params.verifiedAt);

    const apiKey = this.configService.getOrThrow<string>('OCTOMO_API_KEY');
    const response = await fetch(
      'https://api.octoverse.kr/octomo/v1/public/message/exists',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Octomo ${apiKey}`,
        },
        body: JSON.stringify({
          mobileNum: params.phoneDigits,
          withinMinutes: 30,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('OCTOMO_INVALID');
    }

    const body = (await response.json()) as { exists?: boolean };
    if (!body.exists) {
      throw new Error('OCTOMO_INVALID');
    }
  }

  private assertVerifiedAtFresh(verifiedAt: Date): void {
    const ageMs = Date.now() - verifiedAt.getTime();
    const maxAgeMs = 30 * 60 * 1000;
    if (Number.isNaN(verifiedAt.getTime()) || ageMs > maxAgeMs || ageMs < -60_000) {
      throw new Error('OCTOMO_EXPIRED');
    }
  }
}
