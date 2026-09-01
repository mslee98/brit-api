import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { AuditLogService } from './audit-log.service';
import { AuditActionType } from './domain/enums/audit-action-type.enum';
import { AuditTargetType } from './domain/enums/audit-target-type.enum';
import { AuditLogEntity } from './infrastructure/entities/audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let auditLogRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let userRepository: {
    find: jest.Mock;
  };

  const actorUser = {
    id: 'admin-1',
    loginId: 'sysadmin',
    profile: { name: '시스템 관리자' },
  } as UserEntity;

  const targetUser = {
    id: 'user-1',
    loginId: 'user01',
    profile: { name: '홍길동' },
  } as UserEntity;

  const creditLog = {
    id: 'audit-1',
    actorUserId: 'admin-1',
    actorUser,
    actionType: AuditActionType.ADMIN_COIN_CREDIT,
    targetType: AuditTargetType.USER,
    targetId: 'user-1',
    beforeData: { nonSellableBalance: '10000' },
    afterData: {
      transactionId: 'tx-1',
      amount: '20000',
      balanceType: 'NON_SELLABLE',
      wallet: { nonSellableBalance: '30000' },
    },
    reason: '보정',
    ipAddress: '127.0.0.1',
    createdAt: new Date('2026-08-18T01:30:00.000Z'),
  } as AuditLogEntity;

  beforeEach(async () => {
    auditLogRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    userRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLogEntity),
          useValue: auditLogRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: userRepository,
        },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  it('search returns actor/target names and coin adjustment summary', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[creditLog], 1]),
    };
    auditLogRepository.createQueryBuilder.mockReturnValue(qb);
    userRepository.find.mockResolvedValue([targetUser]);

    const result = await service.search({
      page: 1,
      size: 20,
      actionType: AuditActionType.ADMIN_COIN_CREDIT,
      targetType: AuditTargetType.USER,
      targetId: 'user-1',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.actor).toEqual({
      userId: 'admin-1',
      loginId: 'sysadmin',
      name: '시스템 관리자',
    });
    expect(result.items[0]?.target).toEqual({
      userId: 'user-1',
      loginId: 'user01',
      name: '홍길동',
    });
    expect(result.items[0]?.coinAdjustment).toEqual({
      transactionId: 'tx-1',
      amount: '20000',
      balanceType: 'NON_SELLABLE',
      deduction: null,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'log.actionType = :actionType',
      expect.any(Object),
    );
  });

  it('search applies actionTypes IN filter', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    auditLogRepository.createQueryBuilder.mockReturnValue(qb);

    await service.search({
      page: 1,
      size: 20,
      actionTypes: [
        AuditActionType.ADMIN_COIN_CREDIT,
        AuditActionType.ADMIN_COIN_DEBIT,
      ],
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      'log.actionType IN (:...actionTypes)',
      {
        actionTypes: [
          AuditActionType.ADMIN_COIN_CREDIT,
          AuditActionType.ADMIN_COIN_DEBIT,
        ],
      },
    );
  });

  it('getDetail returns before/after data and coin summary', async () => {
    auditLogRepository.findOne.mockResolvedValue(creditLog);
    userRepository.find.mockResolvedValue([targetUser]);

    const result = await service.getDetail('audit-1');

    expect(result.beforeData).toEqual({ nonSellableBalance: '10000' });
    expect(result.afterData?.transactionId).toBe('tx-1');
    expect(result.coinAdjustment?.amount).toBe('20000');
    expect(result.target?.name).toBe('홍길동');
  });
});
