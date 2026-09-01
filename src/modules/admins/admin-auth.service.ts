import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { verifySecret } from '../../common/utils/password.util';
import { AuthService } from '../auth/auth.service';
import { AuthClientType } from '../auth/domain/enums/auth-client-type.enum';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { AdminDomainException } from './exceptions/admin.exceptions';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';
import { AdminLoginDto } from './dto/admin-login.dto';

export type AdminAuthTokensResponse = {
  admin: {
    id: string;
    loginId: string;
    name: string;
    roles: string[];
    adminLevel: number;
    isLeader: boolean;
    permissions: {
      canViewRevenue: boolean;
      canViewFullIdentity: boolean;
    };
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  };
};

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
  ) {}

  async login(
    dto: AdminLoginDto,
    meta?: { userAgent?: string | null; ipAddress?: string | null },
  ): Promise<AdminAuthTokensResponse> {
    const user = await this.userService.findByLoginId(dto.loginId);
    if (!user) {
      this.logger.warn(`admin login failed: unknown loginId`);
      throw AdminDomainException.invalidCredentials();
    }

    const matched = await verifySecret(dto.password, user.passwordHash);
    if (!matched) {
      this.logger.warn(`admin login failed: bad password userId=${user.id}`);
      throw AdminDomainException.invalidCredentials();
    }

    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(
        `admin login failed: account not active userId=${user.id} status=${user.status}`,
      );
      throw AdminDomainException.accountNotActive();
    }

    const adminRole = await this.userService.getHighestAdminRole(user.id);
    if (!adminRole) {
      this.logger.warn(`admin login failed: no admin role userId=${user.id}`);
      throw AdminDomainException.adminRoleRequired();
    }

    const profile = await this.adminProfileRepository.findOne({
      where: { userId: user.id },
    });
    if (!profile) {
      this.logger.warn(
        `admin login failed: profile missing userId=${user.id}`,
      );
      throw AdminDomainException.adminProfileNotConfigured();
    }
    if (!profile.isActive) {
      this.logger.warn(
        `admin login failed: profile inactive userId=${user.id}`,
      );
      throw AdminDomainException.adminProfileInactive();
    }

    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ADMIN_ACCESS_EXPIRES_SEC'),
    );
    const refreshExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ADMIN_REFRESH_EXPIRES_SEC'),
    );

    const tokens = await this.authService.createSessionTokens(
      user.id,
      adminRole,
      user.status,
      {
        clientType: AuthClientType.ADMIN,
        accessExpiresSec,
        refreshExpiresSec,
        userAgent: meta?.userAgent ?? null,
        ipAddress: meta?.ipAddress ?? null,
      },
    );
    await this.userService.touchLastLogin(user.id);

    const name = (await this.userService.getNameByUserId(user.id)) ?? '관리자';
    const roles = await this.userService.listActiveRoles(user.id);

    return {
      admin: {
        id: user.id,
        loginId: user.loginId,
        name,
        roles: roles.filter(
          (role: UserRole) =>
            role === UserRole.ADMIN || role === UserRole.SYS_ADMIN,
        ),
        adminLevel: profile.adminLevel,
        isLeader: profile.isLeader,
        permissions: {
          canViewRevenue: profile.canViewRevenue,
          canViewFullIdentity: profile.canViewFullIdentity,
        },
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSec: tokens.expiresInSec,
      },
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }> {
    const session = await this.authService.resolveActiveSessionForRefresh(
      dto.refreshToken,
    );
    const user = await this.userService.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw AdminDomainException.invalidRefreshToken();
    }

    const adminRole = await this.userService.getHighestAdminRole(user.id);
    if (!adminRole) {
      throw AdminDomainException.adminRoleRequired();
    }

    const profile = await this.adminProfileRepository.findOne({
      where: { userId: user.id },
    });
    if (!profile) {
      throw AdminDomainException.adminProfileNotConfigured();
    }
    if (!profile.isActive) {
      throw AdminDomainException.adminProfileInactive();
    }

    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ADMIN_ACCESS_EXPIRES_SEC'),
    );
    const refreshExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ADMIN_REFRESH_EXPIRES_SEC'),
    );

    const tokens = await this.authService.rotateSessionTokens(session, {
      clientType: AuthClientType.ADMIN,
      role: adminRole,
      status: user.status,
      accessExpiresSec,
      refreshExpiresSec,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSec: tokens.expiresInSec,
    };
  }

  async logout(input: {
    sessionId?: string;
    refreshToken?: string;
  }): Promise<void> {
    if (input.sessionId) {
      await this.authService.logout(input.sessionId);
      return;
    }
    if (input.refreshToken) {
      await this.authService.logoutByRefreshToken(input.refreshToken);
      return;
    }
    throw AdminDomainException.invalidRefreshToken();
  }

  async getMe(userId: string): Promise<{
    id: string;
    loginId: string;
    name: string;
    status: UserStatus;
    roles: string[];
    adminProfile: {
      adminLevel: number;
      isLeader: boolean;
      canViewRevenue: boolean;
      canViewFullIdentity: boolean;
      isActive: boolean;
    };
    lastLoginAt: Date | null;
  }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw AdminDomainException.adminNotFound();
    }

    const profile = await this.adminProfileRepository.findOne({
      where: { userId },
    });
    if (!profile) {
      throw AdminDomainException.adminProfileNotConfigured();
    }

    const roles = await this.userService.listActiveRoles(userId);
    const name = (await this.userService.getNameByUserId(userId)) ?? '관리자';

    return {
      id: user.id,
      loginId: user.loginId,
      name,
      status: user.status,
      roles: roles.filter(
        (role: UserRole) =>
          role === UserRole.ADMIN || role === UserRole.SYS_ADMIN,
      ),
      adminProfile: {
        adminLevel: profile.adminLevel,
        isLeader: profile.isLeader,
        canViewRevenue: profile.canViewRevenue,
        canViewFullIdentity: profile.canViewFullIdentity,
        isActive: profile.isActive,
      },
      lastLoginAt: user.lastLoginAt,
    };
  }

  listSessions(userId: string, currentSessionId: string) {
    return this.authService.listSessionsForUser(userId, currentSessionId);
  }

  async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    try {
      await this.authService.revokeSessionForUser(userId, sessionId);
    } catch {
      throw AdminDomainException.sessionNotFound();
    }
  }

  revokeAllSessions(userId: string): Promise<void> {
    return this.authService.revokeAllActiveSessions(userId, 'LOGOUT_ALL');
  }

  revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<void> {
    return this.authService.revokeOtherSessionsForUser(
      userId,
      currentSessionId,
    );
  }
}
