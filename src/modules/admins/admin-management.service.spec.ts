import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuthService } from '../auth/auth.service';
import { RoleGrantStatus } from '../users/domain/enums/role-grant-status.enum';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserRoleEntity } from '../users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { UserService } from '../users/user.service';
import { AdminManagementService } from './admin-management.service';
import { AuditLogService } from './audit-log.service';
import { AuditActionType } from './domain/enums/audit-action-type.enum';
import { AdminProfileEntity } from './infrastructure/entities/admin-profile.entity';

describe('AdminManagementService', () => {
  let service: AdminManagementService;
  let userService: {
    grantAdminRoleInTransaction: jest.Mock;
    revokeAdminRoleInTransaction: jest.Mock;
    lockAndCountActiveSysAdmins: jest.Mock;
    listActiveRoles: jest.Mock;
  };
  let authService: {
    revokeAllActiveSessionsInTransaction: jest.Mock;
    listSessionsForUser: jest.Mock;
  };
  let auditLogService: {
    writeInTransaction: jest.Mock;
  };
  let adminProfileRepository: {
    findOne: jest.Mock;
  };

  let userRepo: { findOne: jest.Mock };
  let roleRepo: { exist: jest.Mock; findOne: jest.Mock };
  let profileRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const runTransaction = async <T>(
    work: (manager: {
      getRepository: (entity: unknown) => unknown;
    }) => Promise<T>,
  ): Promise<T> => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === UserEntity) return userRepo;
        if (entity === UserRoleEntity) return roleRepo;
        if (entity === AdminProfileEntity) return profileRepo;
        throw new Error(`unexpected repository: ${String(entity)}`);
      },
    };
    return work(manager);
  };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    roleRepo = { exist: jest.fn(), findOne: jest.fn() };
    profileRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (row) => row),
    };

    userService = {
      grantAdminRoleInTransaction: jest.fn(),
      revokeAdminRoleInTransaction: jest.fn(),
      lockAndCountActiveSysAdmins: jest.fn(),
      listActiveRoles: jest.fn(),
    };
    authService = {
      revokeAllActiveSessionsInTransaction: jest.fn().mockResolvedValue(0),
      listSessionsForUser: jest.fn(),
    };
    auditLogService = {
      writeInTransaction: jest.fn().mockResolvedValue({}),
    };
    adminProfileRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminManagementService,
        {
          provide: DataSource,
          useValue: { transaction: jest.fn(runTransaction) },
        },
        { provide: UserService, useValue: userService },
        { provide: AuthService, useValue: authService },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: getRepositoryToken(AdminProfileEntity),
          useValue: adminProfileRepository,
        },
      ],
    }).compile();

    service = module.get(AdminManagementService);
  });

  describe('registerAdmin', () => {
    it('grants role, saves profile, and revokes existing sessions', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'target',
        status: UserStatus.ACTIVE,
      });
      roleRepo.exist.mockResolvedValue(false);
      profileRepo.findOne.mockResolvedValue(null);
      userService.grantAdminRoleInTransaction.mockResolvedValue({});
      authService.revokeAllActiveSessionsInTransaction.mockResolvedValue(2);

      const result = await service.registerAdmin(
        'actor',
        {
          userId: 'target',
          role: UserRole.ADMIN,
          adminLevel: 1,
          isLeader: false,
          canViewRevenue: false,
          canViewFullIdentity: false,
          reason: '신규 등록',
        },
        '127.0.0.1',
      );

      expect(result).toEqual({ id: 'target' });
      expect(userService.grantAdminRoleInTransaction).toHaveBeenCalled();
      expect(
        authService.revokeAllActiveSessionsInTransaction,
      ).toHaveBeenCalledWith(expect.anything(), 'target', 'ADMIN_ROLE_GRANTED');
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.GRANT_ADMIN_ROLE,
        }),
      );
    });
  });

  describe('activate', () => {
    it('rejects when active admin role is missing', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'admin1',
        status: UserStatus.ACTIVE,
      });
      roleRepo.exist.mockResolvedValue(false);

      await expect(
        service.activate('actor', 'admin1', { reason: '복귀' }, null),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when profile is already active', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'admin1',
        status: UserStatus.ACTIVE,
      });
      roleRepo.exist.mockResolvedValue(true);
      profileRepo.findOne.mockResolvedValue({
        userId: 'admin1',
        isActive: true,
      });

      await expect(
        service.activate('actor', 'admin1', { reason: '복귀' }, null),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_ALREADY_ACTIVE' },
      });
    });

    it('activates inactive profile with active admin role', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'admin1',
        status: UserStatus.ACTIVE,
      });
      roleRepo.exist.mockResolvedValue(true);
      const profile = { userId: 'admin1', isActive: false };
      profileRepo.findOne.mockResolvedValue(profile);

      await service.activate('actor', 'admin1', { reason: '복귀' }, null);

      expect(profile.isActive).toBe(true);
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.ACTIVATE_ADMIN,
        }),
      );
    });
  });

  describe('deactivate', () => {
    it('always revokes sessions', async () => {
      profileRepo.findOne.mockResolvedValue({
        userId: 'admin1',
        isActive: true,
      });
      roleRepo.exist.mockResolvedValue(false);
      authService.revokeAllActiveSessionsInTransaction.mockResolvedValue(3);

      await service.deactivate(
        'actor',
        'admin1',
        { reason: '업무 중지' },
        null,
      );

      expect(
        authService.revokeAllActiveSessionsInTransaction,
      ).toHaveBeenCalledWith(
        expect.anything(),
        'admin1',
        'ADMIN_DEACTIVATED',
      );
    });

    it('blocks last active SYS_ADMIN via lockAndCountActiveSysAdmins', async () => {
      profileRepo.findOne.mockResolvedValue({
        userId: 'admin1',
        isActive: true,
      });
      roleRepo.exist.mockResolvedValue(true);
      userService.lockAndCountActiveSysAdmins.mockResolvedValue(1);

      await expect(
        service.deactivate('actor', 'admin1', { reason: '중지' }, null),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(userService.lockAndCountActiveSysAdmins).toHaveBeenCalled();
      expect(
        authService.revokeAllActiveSessionsInTransaction,
      ).not.toHaveBeenCalled();
    });
  });

  describe('revokeSessions', () => {
    it('revokes sessions and writes REVOKE_ADMIN_SESSIONS audit', async () => {
      profileRepo.findOne.mockResolvedValue({ userId: 'admin1' });
      authService.revokeAllActiveSessionsInTransaction.mockResolvedValue(4);

      const result = await service.revokeSessions(
        'actor',
        'admin1',
        { reason: '비정상 로그인 의심' },
        '10.0.0.1',
      );

      expect(result).toEqual({ revokedSessionCount: 4 });
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.REVOKE_ADMIN_SESSIONS,
          afterData: { revokedSessionCount: 4 },
          reason: '비정상 로그인 의심',
        }),
      );
    });
  });

  describe('revokeRole', () => {
    it('blocks last SYS_ADMIN role revoke', async () => {
      profileRepo.findOne.mockResolvedValue({ userId: 'admin1' });
      roleRepo.findOne.mockResolvedValue({
        userId: 'admin1',
        role: UserRole.SYS_ADMIN,
        status: RoleGrantStatus.ACTIVE,
      });
      userService.lockAndCountActiveSysAdmins.mockResolvedValue(1);

      await expect(
        service.revokeRole(
          'actor',
          'admin1',
          { role: UserRole.SYS_ADMIN, reason: '회수' },
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(userService.revokeAdminRoleInTransaction).not.toHaveBeenCalled();
    });
  });
});
