import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UserStatus } from '../../users/domain/enums/user-status.enum';
import { UserRole } from '../../users/domain/enums/user-role.enum';
import { AuthClientType } from '../domain/enums/auth-client-type.enum';
import { UserSessionStatus } from '../domain/enums/user-session-status.enum';
import { UserSessionEntity } from '../infrastructure/entities/user-session.entity';

type AccessTokenPayload = {
  sub: string;
  sid: string;
  role: UserRole;
  roles?: UserRole[];
  status?: UserStatus;
  tokenType: 'access';
  clientType?: AuthClientType;
};

const ACCESS_ROLES = new Set<string>(Object.values(UserRole));
const CLIENT_TYPES = new Set<string>(Object.values(AuthClientType));

/**
 * Access JWT 검증 Guard.
 * Authorization: Bearer <accessToken>
 * payload: sub(userId), sid(sessionId), role, tokenType='access', clientType
 * 성공 시 request.user = AuthenticatedUser
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepository: Repository<UserSessionEntity>,
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

    const clientType = payload.clientType ?? AuthClientType.USER;
    if (
      payload.tokenType !== 'access' ||
      !payload.sub ||
      !payload.sid ||
      !ACCESS_ROLES.has(payload.role) ||
      !CLIENT_TYPES.has(clientType)
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    const activeSession = await this.sessionRepository.findOne({
      where: {
        id: payload.sid,
        userId: payload.sub,
        status: UserSessionStatus.ACTIVE,
      },
    });
    if (!activeSession || activeSession.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '인증이 필요해요.',
      });
    }

    request.user = {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role,
      status: payload.status,
      tokenType: 'access',
      clientType,
    };
    return true;
  }
}
