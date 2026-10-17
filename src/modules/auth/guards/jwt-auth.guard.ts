import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AccessTokenVerifier } from '../access-token.verifier';

/**
 * Access JWT 검증 Guard.
 * Authorization: Bearer <accessToken>
 * 성공 시 request.user = AuthenticatedUser
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokenVerifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    request.user = await this.accessTokenVerifier.verify(
      header.slice('Bearer '.length),
    );
    return true;
  }
}
