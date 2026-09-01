import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuthClientType } from '../auth/domain/enums/auth-client-type.enum';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { AdminProfileEntity } from '../admins/infrastructure/entities/admin-profile.entity';
import { AuditLogEntity } from '../admins/infrastructure/entities/audit-log.entity';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { BanksService } from './banks.service';
import { BankEntity } from './infrastructure/entities/bank.entity';

describe('BanksService', () => {
  let service: BanksService;
  let bankRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let adminProfileRepository: { findOne: jest.Mock };
  let bankRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditRepo: {
    create: jest.Mock;
    save: jest.Mock;
  };

  const actorSysAdmin = {
    userId: 'sys-admin-id',
    sessionId: 'sid',
    role: UserRole.SYS_ADMIN,
    tokenType: 'access' as const,
    clientType: AuthClientType.ADMIN,
  };

  const actorAdmin = {
    userId: 'admin-id',
    sessionId: 'sid',
    role: UserRole.ADMIN,
    tokenType: 'access' as const,
    clientType: AuthClientType.ADMIN,
  };

  const runTransaction = async <T>(
    work: (manager: {
      getRepository: (entity: unknown) => unknown;
    }) => Promise<T>,
  ): Promise<T> => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === BankEntity) return bankRepo;
        if (entity === AuditLogEntity) return auditRepo;
        throw new Error(`unexpected repository: ${String(entity)}`);
      },
    };
    return work(manager);
  };

  beforeEach(async () => {
    bankRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (row) => ({
        ...row,
        id: row.id ?? 42,
        createdAt: row.createdAt ?? new Date('2026-08-01T01:00:00.000Z'),
        updatedAt: row.updatedAt ?? new Date('2026-08-01T01:00:00.000Z'),
      })),
    };
    auditRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (row) => row),
    };
    bankRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    adminProfileRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BanksService,
        {
          provide: DataSource,
          useValue: { transaction: jest.fn(runTransaction) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ASSET_PUBLIC_BASE_URL') return 'https://cdn.example';
              throw new Error(`missing ${key}`);
            }),
          },
        },
        {
          provide: getRepositoryToken(BankEntity),
          useValue: bankRepository,
        },
        {
          provide: getRepositoryToken(AdminProfileEntity),
          useValue: adminProfileRepository,
        },
      ],
    }).compile();

    service = module.get(BanksService);
  });

  describe('searchAdmin', () => {
    it('리더가 아닌 ADMIN이면 FORBIDDEN', async () => {
      adminProfileRepository.findOne.mockResolvedValue({ isLeader: false });

      await expect(
        service.searchAdmin(actorAdmin, { page: 1, size: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('리더 ADMIN은 목록 조회 가능', async () => {
      adminProfileRepository.findOne.mockResolvedValue({ isLeader: true });
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 1,
              code: '088',
              name: '신한은행',
              iconKey: 'shinhan',
              svgFilename: 'shinhan.svg',
              dailyMaintenanceStart: null,
              dailyMaintenanceEnd: null,
              regularMaintenanceRule: null,
              regularMaintenanceStart: null,
              regularMaintenanceEnd: null,
              maintenanceNote: null,
              sortOrder: 10,
              isActive: true,
              createdAt: new Date('2026-08-01T01:00:00.000Z'),
              updatedAt: new Date('2026-08-01T01:00:00.000Z'),
            },
          ],
          1,
        ]),
      };
      bankRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.searchAdmin(actorAdmin, {
        page: 1,
        size: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
    });
  });

  describe('createBank', () => {
    it('isActive=false로 생성하고 CREATE_BANK 감사에 reason·targetId를 남긴다', async () => {
      const result = await service.createBank(
        actorSysAdmin.userId,
        {
          code: '088',
          name: '신한은행',
          iconKey: 'shinhan',
          svgFilename: 'shinhan.svg',
          reason: '신규 지원 은행 등록',
        },
        '127.0.0.1',
      );

      expect(result.isActive).toBe(false);
      expect(bankRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, code: '088' }),
      );
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.CREATE_BANK,
          targetType: AuditTargetType.BANK,
          targetId: '42',
          reason: '신규 지원 은행 등록',
        }),
      );
    });

    it('점검 시작만 있으면 INVALID_MAINTENANCE_TIME', async () => {
      await expect(
        service.createBank(
          actorSysAdmin.userId,
          {
            code: '088',
            name: '신한은행',
            dailyMaintenanceStart: '23:50',
            reason: '테스트',
          },
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_MAINTENANCE_TIME' },
      });
      expect(bankRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('setBankActive', () => {
    it('이미 활성이면 BANK_ALREADY_ACTIVE', async () => {
      bankRepo.findOne.mockResolvedValue({
        id: 1,
        isActive: true,
        iconKey: 'shinhan',
        svgFilename: 'shinhan.svg',
      });

      await expect(
        service.setBankActive(
          actorSysAdmin.userId,
          1,
          true,
          '재활성화',
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        service.setBankActive(
          actorSysAdmin.userId,
          1,
          true,
          '재활성화',
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'BANK_ALREADY_ACTIVE' },
      });
    });

    it('아이콘 없이 활성화하면 BANK_ICON_REQUIRED', async () => {
      bankRepo.findOne.mockResolvedValue({
        id: 1,
        isActive: false,
        iconKey: null,
        svgFilename: null,
      });

      await expect(
        service.setBankActive(
          actorSysAdmin.userId,
          1,
          true,
          '활성화',
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'BANK_ICON_REQUIRED' },
      });
    });

    it('비활성화는 isActive만 바꾸고 계좌 repository를 쓰지 않는다', async () => {
      const bank = {
        id: 7,
        isActive: true,
        iconKey: 'shinhan',
        svgFilename: 'shinhan.svg',
      };
      bankRepo.findOne.mockResolvedValue(bank);

      await service.setBankActive(
        actorSysAdmin.userId,
        7,
        false,
        '지원 종료',
        '10.0.0.1',
      );

      expect(bank.isActive).toBe(false);
      expect(bankRepo.save).toHaveBeenCalledWith(bank);
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.DEACTIVATE_BANK,
          targetId: '7',
          reason: '지원 종료',
          afterData: { isActive: false },
        }),
      );
    });
  });
});
