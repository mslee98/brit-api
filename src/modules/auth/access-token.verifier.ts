import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AuthClientType } from './domain/enums/auth-client-type.enum';
import { UserSessionStatus } from './domain/enums/user-session-status.enum';
import { UserSessionEntity } from './infrastructure/entities/user-session.entity';

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
 * Access JWT + 세션 재검증. HTTP Guard·WebSocket handshake에서 공유.
 */
@Injectable()
export class AccessTokenVerifier {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepository: Repository<UserSessionEntity>,
  ) {}

  async verify(token: string): Promise<AuthenticatedUser> {
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

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role,
      status: payload.status,
      tokenType: 'access',
      clientType,
    };
  }
}
