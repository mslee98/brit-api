import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthService } from '../auth/auth.service';
import { AuthClientType } from '../auth/domain/enums/auth-client-type.enum';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';

jest.mock('../../common/utils/password.util', () => ({
  verifySecret: jest.fn(async () => true),
}));

import { verifySecret } from '../../common/utils/password.util';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let userService: {
    findByLoginId: jest.Mock;
    findById: jest.Mock;
    getHighestAdminRole: jest.Mock;
    listActiveRoles: jest.Mock;
    getNameByUserId: jest.Mock;
    touchLastLogin: jest.Mock;
  };
  let authService: {
    createSessionTokens: jest.Mock;
    resolveActiveSessionForRefresh: jest.Mock;
    rotateSessionTokens: jest.Mock;
    revokeAllActiveSessions: jest.Mock;
  };
  let adminProfileRepository: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    userService = {
      findByLoginId: jest.fn(),
      findById: jest.fn(),
      getHighestAdminRole: jest.fn(),
      listActiveRoles: jest.fn(),
      getNameByUserId: jest.fn(),
      touchLastLogin: jest.fn(),
    };
    authService = {
      createSessionTokens: jest.fn(),
      resolveActiveSessionForRefresh: jest.fn(),
      rotateSessionTokens: jest.fn(),
      revokeAllActiveSessions: jest.fn(),
    };
    adminProfileRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => {
          if (key.includes('ACCESS')) return '900';
          return '604800';
        } } },
        { provide: UserService, useValue: userService },
        { provide: AuthService, useValue: authService },
        {
          provide: getRepositoryToken(AdminProfileEntity),
          useValue: adminProfileRepository,
        },
      ],
    }).compile();

    service = module.get(AdminAuthService);
    jest.mocked(verifySecret).mockResolvedValue(true);
  });

  it('logs in active admin and issues ADMIN clientType tokens', async () => {
    userService.findByLoginId.mockResolvedValue({
      id: 'u1',
      loginId: 'sysadmin',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
    });
    userService.getHighestAdminRole.mockResolvedValue(UserRole.SYS_ADMIN);
    userService.listActiveRoles.mockResolvedValue([UserRole.SYS_ADMIN]);
    userService.getNameByUserId.mockResolvedValue('시스템관리자');
    adminProfileRepository.findOne.mockResolvedValue({
      userId: 'u1',
      adminLevel: 3,
      isLeader: true,
      canViewRevenue: false,
      canViewFullIdentity: false,
      isActive: true,
    });
    authService.createSessionTokens.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresInSec: 900,
      sessionId: 's1',
    });

    const result = await service.login({
      loginId: 'sysadmin',
      password: 'password1',
    });

    expect(authService.createSessionTokens).toHaveBeenCalledWith(
      'u1',
      UserRole.SYS_ADMIN,
      UserStatus.ACTIVE,
      expect.objectContaining({ clientType: AuthClientType.ADMIN }),
    );
    expect(result.admin.roles).toEqual([UserRole.SYS_ADMIN]);
    expect(result.tokens.accessToken).toBe('a');
  });

  it('rejects inactive admin profile', async () => {
    userService.findByLoginId.mockResolvedValue({
      id: 'u1',
      loginId: 'admin01',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
    });
    userService.getHighestAdminRole.mockResolvedValue(UserRole.ADMIN);
    adminProfileRepository.findOne.mockResolvedValue({
      userId: 'u1',
      isActive: false,
    });

    await expect(
      service.login({ loginId: 'admin01', password: 'password1' }),
    ).rejects.toMatchObject({
      response: { code: 'ADMIN_PROFILE_INACTIVE' },
    });
  });

  it('rejects user without admin role', async () => {
    userService.findByLoginId.mockResolvedValue({
      id: 'u1',
      loginId: 'user01',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
    });
    userService.getHighestAdminRole.mockResolvedValue(null);

    await expect(
      service.login({ loginId: 'user01', password: 'password1' }),
    ).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
  });
});
