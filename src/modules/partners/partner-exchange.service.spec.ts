import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CoinService } from '../coins/coin.service';
import { CoinLedgerEntryType } from '../coins/domain/enums/coin-ledger-entry-type.enum';
import { CoinSourceType } from '../coins/domain/enums/coin-source-type.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { FeeRoundingRule } from './domain/enums/fee-rounding-rule.enum';
import { FeeSettlementCycle } from './domain/enums/fee-settlement-cycle.enum';
import { PartnerCoinLedgerEntryType } from './domain/enums/partner-coin-ledger-entry-type.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from './domain/enums/partner-exchange-type.enum';
import { PartnerFeeAccrualStatus } from './domain/enums/partner-fee-accrual-status.enum';
import { PartnerFeeTarget } from './domain/enums/partner-fee-target.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { UserPartnerLinkStatus } from './domain/enums/user-partner-link-status.enum';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';

/**
 * 사용자 MS 보유 → CHARGE(업체 입금) → REDEEM(환전) 시나리오.
 * CoinService / PartnerCoinService는 mock, 전환·수수료 오케스트레이션을 검증한다.
 */
describe('PartnerExchangeService flow', () => {
  const partnerId = 'partner-1';
  const userId = 'user-1';
  const linkId = 'link-1';
  const assetId = 'asset-1';
  const policyId = 'policy-1';
  const clientId = 'client-1';

  let service: PartnerExchangeService;
  let coinService: jest.Mocked<Pick<
    CoinService,
    'debitNonSellable' | 'creditSellable'
  >>;
  let partnerCoinService: jest.Mocked<
    Pick<PartnerCoinService, 'creditAvailable' | 'debitAvailable'>
  >;

  let partners: Map<string, PartnerEntity>;
  let assets: Map<string, PartnerAssetEntity>;
  let links: Map<string, UserPartnerLinkEntity>;
  let exchanges: Map<string, PartnerExchangeEntity>;
  let accruals: PartnerFeeAccrualEntity[];
  let feePolicy: PartnerFeePolicyEntity;

  function seedPartnerWorld() {
    partners.set(partnerId, {
      id: partnerId,
      code: 'SHOP_A',
      name: '에이샵',
      status: PartnerStatus.ACTIVE,
    } as PartnerEntity);

    assets.set(assetId, {
      id: assetId,
      partnerId,
      assetCode: 'POINT',
      assetName: '샵 포인트',
      assetType: 'POINT',
      isActive: true,
      createdAt: new Date(),
    } as PartnerAssetEntity);

    links.set(linkId, {
      id: linkId,
      partnerId,
      userId,
      partnerUserKey: 'A-123',
      status: UserPartnerLinkStatus.ACTIVE,
    } as UserPartnerLinkEntity);

    feePolicy = {
      id: policyId,
      partnerId,
      feeTarget: PartnerFeeTarget.ALL,
      feeRateBps: 70,
      fixedFeeAmount: '0',
      roundingRule: FeeRoundingRule.FLOOR,
      settlementCycle: FeeSettlementCycle.WEEKLY,
      settlementWeekday: 1,
      paymentDueDays: 3,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
      createdByUserId: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PartnerFeePolicyEntity;
  }

  function makeRepo<T extends { id?: string }>(
    store: Map<string, T> | T[],
  ): Partial<Repository<T>> {
    return {
      create: (data: Partial<T>) => ({ ...data }) as T,
      save: async (entity: T | T[]) => {
        const item = Array.isArray(entity) ? entity[0] : entity;
        if (!item.id) {
          item.id = `id-${Math.random().toString(36).slice(2, 8)}`;
        }
        if (Array.isArray(store)) {
          store.push(item);
        } else {
          store.set(item.id!, item);
        }
        return item;
      },
      findOne: async (options: {
        where?: Record<string, unknown>;
        order?: unknown;
        lock?: unknown;
      }) => {
        const where = options.where ?? {};
        const values = Array.isArray(store)
          ? store
          : Array.from(store.values());
        return (
          values.find((row) =>
            Object.entries(where).every(
              ([k, v]) => (row as Record<string, unknown>)[k] === v,
            ),
          ) ?? null
        );
      },
    };
  }

  beforeEach(async () => {
    partners = new Map();
    assets = new Map();
    links = new Map();
    exchanges = new Map();
    accruals = [];
    seedPartnerWorld();

    coinService = {
      debitNonSellable: jest.fn().mockResolvedValue(undefined),
      creditSellable: jest.fn().mockResolvedValue(undefined),
    };
    partnerCoinService = {
      creditAvailable: jest.fn().mockResolvedValue(undefined),
      debitAvailable: jest.fn().mockResolvedValue(undefined),
    };

    const exchangeRepo = makeRepo(exchanges) as Repository<PartnerExchangeEntity>;
    const originalExchangeSave = exchangeRepo.save!.bind(exchangeRepo);
    exchangeRepo.save = (async (entity: PartnerExchangeEntity) => {
      const saved = await originalExchangeSave(entity);
      exchanges.set(saved.id, { ...saved });
      return saved;
    }) as typeof exchangeRepo.save;

    const accrualRepo = {
      create: (data: Partial<PartnerFeeAccrualEntity>) =>
        ({ ...data }) as PartnerFeeAccrualEntity,
      save: async (entity: PartnerFeeAccrualEntity) => {
        if (!entity.id) entity.id = `accrual-${accruals.length + 1}`;
        accruals.push({ ...entity });
        return entity;
      },
    };

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === PartnerExchangeEntity) return exchangeRepo;
        if (entity === PartnerFeeAccrualEntity) return accrualRepo;
        throw new Error(`unexpected repo ${String(entity)}`);
      },
    } as unknown as EntityManager;

    const dataSource = {
      transaction: async <T>(fn: (m: EntityManager) => Promise<T>) =>
        fn(manager),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerExchangeService,
        { provide: CoinService, useValue: coinService },
        { provide: PartnerCoinService, useValue: partnerCoinService },
        {
          provide: PartnerFeePoliciesService,
          useValue: {
            findApplicableActivePolicy: jest
              .fn()
              .mockImplementation(async () => feePolicy),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: userId,
              status: UserStatus.ACTIVE,
              loginId: 'user1',
            }),
          },
        },
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: makeRepo(partners),
        },
        {
          provide: getRepositoryToken(PartnerAssetEntity),
          useValue: {
            ...makeRepo(assets),
            findOne: async (options: {
              where?: Record<string, unknown>;
              order?: unknown;
            }) => {
              const where = options.where ?? {};
              return (
                Array.from(assets.values()).find((row) =>
                  Object.entries(where).every(
                    ([k, v]) => (row as Record<string, unknown>)[k] === v,
                  ),
                ) ?? null
              );
            },
          },
        },
        {
          provide: getRepositoryToken(PartnerExchangeEntity),
          useValue: exchangeRepo,
        },
        {
          provide: getRepositoryToken(UserPartnerLinkEntity),
          useValue: makeRepo(links),
        },
      ],
    }).compile();

    service = module.get(PartnerExchangeService);
  });

  it('CHARGE then REDEEM: 사용자 MS → 업체 입금 → 환전 + 수수료 스냅샷', async () => {
    const charge = await service.charge(partnerId, clientId, {
      idempotencyKey: 'idem-charge-1',
      partnerUserKey: 'A-123',
      amount: '50000',
    });

    expect(charge.status).toBe(PartnerExchangeStatus.COMPLETED);
    expect(charge.exchangeType).toBe(PartnerExchangeType.CHARGE);
    expect(charge.amount).toBe('50000');
    expect(coinService.debitNonSellable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId,
        amount: '50000',
        entryType: CoinLedgerEntryType.PARTNER_CHARGE_DEBIT,
      }),
    );
    expect(partnerCoinService.creditAvailable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        partnerId,
        amount: '50000',
        entryType: PartnerCoinLedgerEntryType.CHARGE_CREDIT,
      }),
    );
    expect(accruals).toHaveLength(1);
    expect(accruals[0]).toMatchObject({
      exchangeType: PartnerExchangeType.CHARGE,
      grossAmount: '50000',
      feeRateBps: 70,
      percentageFeeAmount: '350',
      totalFeeAmount: '350',
      status: PartnerFeeAccrualStatus.ACCRUED,
    });

    const redeem = await service.redeem(partnerId, clientId, {
      idempotencyKey: 'idem-redeem-1',
      partnerUserKey: 'A-123',
      amount: '20000',
    });

    expect(redeem.status).toBe(PartnerExchangeStatus.COMPLETED);
    expect(redeem.exchangeType).toBe(PartnerExchangeType.REDEEM);
    expect(partnerCoinService.debitAvailable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        partnerId,
        amount: '20000',
        entryType: PartnerCoinLedgerEntryType.REDEEM_DEBIT,
      }),
    );
    expect(coinService.creditSellable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId,
        amount: '20000',
        sourceType: CoinSourceType.PARTNER_REDEEM,
        entryType: CoinLedgerEntryType.PARTNER_REDEEM_CREDIT,
        isSellable: true,
      }),
    );
    expect(accruals).toHaveLength(2);
    expect(accruals[1]).toMatchObject({
      exchangeType: PartnerExchangeType.REDEEM,
      grossAmount: '20000',
      percentageFeeAmount: '140',
      totalFeeAmount: '140',
    });

    // 호출 순서: CHARGE 사용자 차감 → 업체 입금, REDEEM 업체 차감 → 사용자 지급
    expect(coinService.debitNonSellable.mock.invocationCallOrder[0]).toBeLessThan(
      partnerCoinService.creditAvailable.mock.invocationCallOrder[0],
    );
    expect(
      partnerCoinService.debitAvailable.mock.invocationCallOrder[0],
    ).toBeLessThan(coinService.creditSellable.mock.invocationCallOrder[0]);
  });

  it('동일 idempotencyKey CHARGE는 기존 결과를 반환하고 원장을 다시 건드리지 않는다', async () => {
    const first = await service.charge(partnerId, clientId, {
      idempotencyKey: 'idem-same',
      partnerUserKey: 'A-123',
      amount: '10000',
    });
    coinService.debitNonSellable.mockClear();
    partnerCoinService.creditAvailable.mockClear();

    const second = await service.charge(partnerId, clientId, {
      idempotencyKey: 'idem-same',
      partnerUserKey: 'A-123',
      amount: '10000',
    });

    expect(second.id).toBe(first.id);
    expect(coinService.debitNonSellable).not.toHaveBeenCalled();
    expect(partnerCoinService.creditAvailable).not.toHaveBeenCalled();
  });

  it('동일 idempotencyKey에 다른 금액이면 conflict', async () => {
    await service.charge(partnerId, clientId, {
      idempotencyKey: 'idem-conflict',
      partnerUserKey: 'A-123',
      amount: '10000',
    });

    await expect(
      service.charge(partnerId, clientId, {
        idempotencyKey: 'idem-conflict',
        partnerUserKey: 'A-123',
        amount: '20000',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_EXCHANGE_IDEMPOTENCY_CONFLICT' },
    });
  });
});
