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
import { UserRole } from '../../users/domain/enums/user-role.enum';

type AccessTokenPayload = {
  sub: string;
  sid: string;
  role: UserRole;
  tokenType: 'access';
};

const ACCESS_ROLES = new Set<string>(Object.values(UserRole));

/**
 * Access JWT 검증 Guard.
 * Authorization: Bearer <accessToken>
 * payload: sub(userId), sid(sessionId), role, tokenType='access'
 * 성공 시 request.user = AuthenticatedUser
 */
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

    if (
      payload.tokenType !== 'access' ||
      !payload.sub ||
      !payload.sid ||
      !ACCESS_ROLES.has(payload.role)
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    request.user = {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role,
      tokenType: 'access',
    };
    return true;
  }
}
