import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AdminAccessService } from '../admins/admin-access.service';
import { AuditLogEntity } from '../admins/infrastructure/entities/audit-log.entity';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { MatchingPolicyEntity } from './infrastructure/entities/matching-policy.entity';
import { MatchingPolicyService } from './matching-policy.service';

describe('MatchingPolicyService', () => {
  let service: MatchingPolicyService;
  let store: {
    policies: Map<string, MatchingPolicyEntity>;
    auditLogs: AuditLogEntity[];
  };

  beforeEach(async () => {
    store = { policies: new Map(), auditLogs: [] };
    const now = new Date();
    store.policies.set('policy-1', {
      id: 'policy-1',
      minSplitRatioBps: 2000,
      buyerPaymentTimeoutSeconds: 300,
      sellerConfirmationTimeoutSeconds: 180,
      maxRematchCount: 3,
      nearMatchMaxRatioBps: 1000,
      isActive: true,
      effectiveFrom: now,
      createdByUserId: null,
      reason: 'seed',
      createdAt: now,
      updatedAt: now,
    } as MatchingPolicyEntity);

    const dataSource = {
      transaction: async (fn: (manager: unknown) => Promise<unknown>) =>
        fn({
          getRepository: (entity: unknown) => {
            if (entity === MatchingPolicyEntity) {
              return {
                find: async ({ where }: { where: { isActive?: boolean } }) =>
                  [...store.policies.values()]
                    .filter((row) =>
                      where.isActive === undefined
                        ? true
                        : row.isActive === where.isActive,
                    )
                    .map((row) => ({ ...row })),
                save: async (row: MatchingPolicyEntity) => {
                  store.policies.set(row.id, { ...row });
                  return { ...row };
                },
                create: (data: Partial<MatchingPolicyEntity>) =>
                  ({
                    id: `policy-${store.policies.size + 1}`,
                    ...data,
                  }) as MatchingPolicyEntity,
              };
            }
            if (entity === AuditLogEntity) {
              return {
                create: (data: Partial<AuditLogEntity>) =>
                  ({ ...data }) as AuditLogEntity,
                save: async (row: AuditLogEntity) => {
                  store.auditLogs.push({ ...row });
                  return { ...row };
                },
              };
            }
            throw new Error('unexpected entity');
          },
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingPolicyService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: AdminAccessService,
          useValue: { assertIsLeaderOrSysAdmin: jest.fn() },
        },
        {
          provide: getRepositoryToken(MatchingPolicyEntity),
          useValue: {
            findOne: async () => ({ ...store.policies.get('policy-1')! }),
            findAndCount: async () => [
              [...store.policies.values()],
              store.policies.size,
            ],
          },
        },
      ],
    }).compile();

    service = module.get(MatchingPolicyService);
  });

  it('getActivePolicy returns active policy', async () => {
    const policy = await service.getActivePolicy();
    expect(policy.maxRematchCount).toBe(3);
    expect(policy.isActive).toBe(true);
  });

  it('createPolicyVersion deactivates previous and creates new', async () => {
    const created = await service.createPolicyVersion(
      'sys-admin-1',
      UserRole.SYS_ADMIN,
      {
        minSplitRatioBps: 2500,
        buyerPaymentTimeoutSeconds: 400,
        sellerConfirmationTimeoutSeconds: 200,
        maxRematchCount: 5,
        nearMatchMaxRatioBps: 1500,
        effectiveFrom: new Date().toISOString(),
        reason: 'timeout 조정',
      },
      '127.0.0.1',
    );

    expect(created.isActive).toBe(true);
    expect(created.maxRematchCount).toBe(5);
    expect(created.nearMatchMaxRatioBps).toBe(1500);
    expect(store.policies.get('policy-1')?.isActive).toBe(false);
    expect(store.auditLogs).toHaveLength(1);
  });
});
