import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';

type AccessTokenPayload = {
  sub: string;
  sid: string;
  tokenType: 'access';
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    const token = header.slice('Bearer '.length);
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
      if (payload.tokenType !== 'access') {
        throw new Error('invalid token type');
      }
      request.user = {
        userId: payload.sub,
        sessionId: payload.sid,
        tokenType: 'access',
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }
  }
}
