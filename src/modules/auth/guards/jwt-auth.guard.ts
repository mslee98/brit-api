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
  role: string;
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
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    const token = header.slice('Bearer '.length);
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    if (payload.tokenType !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    request.user = {
      userId: payload.sub,
      sessionId: payload.sid,
      tokenType: 'access',
    };
    return true;
  }
}
