import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthDomainException } from './exceptions/auth.exceptions';

export type AccountVerifyPayload = {
  typ: 'account_verify';
  name: string;
  bankCode: string;
  accountNumberHash: string;
  holderName: string;
};

export const ACCOUNT_VERIFY_EXPIRES_SEC = 600;

@Injectable()
export class AccountVerifyTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issue(params: {
    name: string;
    bankCode: string;
    accountNumberHash: string;
    holderName: string;
  }): Promise<{ token: string; expiresInSec: number }> {
    const secret = this.configService.getOrThrow<string>(
      'ACCOUNT_VERIFY_SECRET',
    );
    const token = await this.jwtService.signAsync(
      {
        typ: 'account_verify',
        name: params.name,
        bankCode: params.bankCode,
        accountNumberHash: params.accountNumberHash,
        holderName: params.holderName,
      } satisfies AccountVerifyPayload,
      {
        secret,
        expiresIn: ACCOUNT_VERIFY_EXPIRES_SEC,
      },
    );
    return { token, expiresInSec: ACCOUNT_VERIFY_EXPIRES_SEC };
  }

  async verify(token: string): Promise<AccountVerifyPayload> {
    const secret = this.configService.getOrThrow<string>(
      'ACCOUNT_VERIFY_SECRET',
    );
    try {
      const payload = await this.jwtService.verifyAsync<AccountVerifyPayload>(
        token,
        { secret },
      );
      if (payload.typ !== 'account_verify') {
        throw AuthDomainException.accountVerifyExpired();
      }
      return payload;
    } catch (error) {
      if (
        error instanceof Error &&
        'getStatus' in error &&
        typeof (error as { getStatus: () => number }).getStatus === 'function'
      ) {
        throw error;
      }
      throw AuthDomainException.accountVerifyExpired();
    }
  }
}
