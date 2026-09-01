import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { CoinService } from '../coins/coin.service';
import { MatchingService } from '../matching/matching.service';
import { UserService } from '../users/user.service';
import { BuyOrderStatus } from './domain/enums/buy-order-status.enum';
import { SellOrderStatus } from './domain/enums/sell-order-status.enum';
import { BuyOrderEntity } from './infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from './infrastructure/entities/matching-policy.entity';
import { OrderNumberSequenceEntity } from './infrastructure/entities/order-number-sequence.entity';
import { SellOrderCoinLotEntity } from './infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from './infrastructure/entities/sell-order.entity';
import { SellOrderService } from './sell-order.service';
import { BuyOrderService } from './buy-order.service';
import { BuyOrderResponseDto } from './dto/buy-order-response.dto';

type OrderStore = {
  policies: Map<string, MatchingPolicyEntity>;
  sequences: Map<string, OrderNumberSequenceEntity>;
  sellOrders: Map<string, SellOrderEntity>;
  sellAllocs: SellOrderCoinLotEntity[];
  buyOrders: Map<string, BuyOrderEntity>;
};

function createOrderStore(): OrderStore {
  const policy: MatchingPolicyEntity = {
    id: 'policy-001',
    minSplitRatioBps: 2000,
    buyerPaymentTimeoutSeconds: 300,
    sellerConfirmationTimeoutSeconds: 180,
    maxRematchCount: 3,
    nearMatchMaxRatioBps: 1000,
    isActive: true,
    effectiveFrom: new Date(),
    createdByUserId: null,
    reason: null,
    createdByUser: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    policies: new Map([[policy.id, policy]]),
    sequences: new Map(),
    sellOrders: new Map(),
    sellAllocs: [],
    buyOrders: new Map(),
  };
}

describe('P0-4 Buy/Sell Orders', () => {
  const userId = 'user-seller';
  let store: OrderStore;
  let sellService: SellOrderService;
  let buyService: BuyOrderService;
  let coinService: {
    lockSellableInTransaction: jest.Mock;
    releaseSellableInTransaction: jest.Mock;
  };
  let lockedAmount = 0n;
  let lockCallCount = 0;

  beforeEach(async () => {
    store = createOrderStore();
    lockedAmount = 0n;
    lockCallCount = 0;

    coinService = {
      lockSellableInTransaction: jest.fn(
        async (
          _manager: EntityManager,
          params: { amount: string },
        ) => {
          lockCallCount += 1;
          if (BigInt(params.amount) > 500000n - lockedAmount) {
            throw new ConflictException({
              code: 'COIN_SELLABLE_BALANCE_INSUFFICIENT',
            });
          }
          lockedAmount += BigInt(params.amount);
          return [
            { coinLotId: 'lot-a', lockedAmount: params.amount },
          ];
        },
      ),
      releaseSellableInTransaction: jest.fn(
        async (
          _manager: EntityManager,
          params: {
            amount: string;
            allocations: Array<{ coinLotId: string; availableToRelease: string }>;
          },
        ) => {
          lockedAmount -= BigInt(params.amount);
          return params.allocations
            .filter((a) => BigInt(a.availableToRelease) > 0n)
            .map((a) => ({
              coinLotId: a.coinLotId,
              releasedAmount: params.amount,
            }));
        },
      ),
    };

    const userService = {
      assertP2pEligibleInTransaction: jest.fn(async () => undefined),
    };

    const makeOrderManager = (): EntityManager =>
      ({
        getRepository: (entity: unknown) => {
          if (entity === MatchingPolicyEntity) {
            return {
              findOne: async () => [...store.policies.values()][0] ?? null,
              create: (data: Partial<MatchingPolicyEntity>) =>
                ({ ...data }) as MatchingPolicyEntity,
              save: async (row: MatchingPolicyEntity) => {
                store.policies.set(row.id, row);
                return row;
              },
            };
          }
          if (entity === OrderNumberSequenceEntity) {
            return {
              findOne: async ({
                where,
              }: {
                where: { prefix: string; yyyymmdd: string };
              }) => {
                const key = `${where.prefix}:${where.yyyymmdd}`;
                const row = store.sequences.get(key);
                return row ? { ...row } : null;
              },
              findOneOrFail: async ({
                where,
              }: {
                where: { prefix: string; yyyymmdd: string };
              }) => {
                const key = `${where.prefix}:${where.yyyymmdd}`;
                const row = store.sequences.get(key);
                if (!row) {
                  throw new Error('seq missing');
                }
                return { ...row };
              },
              create: (data: Partial<OrderNumberSequenceEntity>) =>
                ({ ...data }) as OrderNumberSequenceEntity,
              save: async (row: OrderNumberSequenceEntity) => {
                const key = `${row.prefix}:${row.yyyymmdd}`;
                store.sequences.set(key, { ...row });
                return row;
              },
            };
          }
          if (entity === SellOrderEntity) {
            return {
              findOne: async ({
                where,
              }: {
                where: Record<string, string>;
                lock?: unknown;
              }) => {
                if (where.idempotencyKey) {
                  const found = [...store.sellOrders.values()].find(
                    (o) =>
                      o.sellerUserId === where.sellerUserId &&
                      o.idempotencyKey === where.idempotencyKey,
                  );
                  return found ? { ...found } : null;
                }
                if (where.id) {
                  const found = store.sellOrders.get(where.id);
                  if (!found) {
                    return null;
                  }
                  if (
                    where.sellerUserId &&
                    found.sellerUserId !== where.sellerUserId
                  ) {
                    return null;
                  }
                  return { ...found };
                }
                return null;
              },
              create: (data: Partial<SellOrderEntity>) =>
                ({ ...data }) as SellOrderEntity,
              save: async (row: SellOrderEntity) => {
                if (!row.id) {
                  row.id = `sell-${store.sellOrders.size + 1}`;
                }
                if (!row.createdAt) {
                  row.createdAt = new Date();
                }
                store.sellOrders.set(row.id, { ...row });
                return { ...row };
              },
              findAndCount: async () => [[...store.sellOrders.values()], store.sellOrders.size],
              find: async () => [...store.sellOrders.values()],
            };
          }
          if (entity === SellOrderCoinLotEntity) {
            return {
              create: (data: Partial<SellOrderCoinLotEntity>) =>
                ({ ...data }) as SellOrderCoinLotEntity,
              save: async (row: SellOrderCoinLotEntity) => {
                const idx = store.sellAllocs.findIndex(
                  (a) =>
                    a.sellOrderId === row.sellOrderId &&
                    a.coinLotId === row.coinLotId,
                );
                if (idx >= 0) {
                  store.sellAllocs[idx] = { ...row };
                } else {
                  if (!row.createdAt) {
                    row.createdAt = new Date();
                  }
                  store.sellAllocs.push({ ...row });
                }
                return row;
              },
              find: async ({
                where,
              }: {
                where: { sellOrderId: string };
                order?: unknown;
                lock?: unknown;
              }) =>
                store.sellAllocs
                  .filter((a) => a.sellOrderId === where.sellOrderId)
                  .map((a) => ({ ...a })),
            };
          }
          if (entity === BuyOrderEntity) {
            return {
              findOne: async ({
                where,
              }: {
                where: Record<string, string>;
                lock?: unknown;
              }) => {
                if (where.idempotencyKey) {
                  const found = [...store.buyOrders.values()].find(
                    (o) =>
                      o.buyerUserId === where.buyerUserId &&
                      o.idempotencyKey === where.idempotencyKey,
                  );
                  return found ? { ...found } : null;
                }
                if (where.id) {
                  const found = store.buyOrders.get(where.id);
                  if (!found) {
                    return null;
                  }
                  if (
                    where.buyerUserId &&
                    found.buyerUserId !== where.buyerUserId
                  ) {
                    return null;
                  }
                  return { ...found };
                }
                return null;
              },
              create: (data: Partial<BuyOrderEntity>) =>
                ({ ...data }) as BuyOrderEntity,
              save: async (row: BuyOrderEntity) => {
                if (!row.id) {
                  row.id = `buy-${store.buyOrders.size + 1}`;
                }
                if (!row.createdAt) {
                  row.createdAt = new Date();
                }
                store.buyOrders.set(row.id, { ...row });
                return { ...row };
              },
              findAndCount: async () => [
                [...store.buyOrders.values()],
                store.buyOrders.size,
              ],
              find: async () => [...store.buyOrders.values()],
            };
          }
          throw new Error(`Unexpected entity ${String(entity)}`);
        },
      }) as unknown as EntityManager;

    const dataSource = {
      transaction: async (fn: (manager: EntityManager) => Promise<unknown>) =>
        fn(makeOrderManager()),
      getRepository: () => ({}),
    };

    const sellOrderRepo = {
      findAndCount: async () => [
        [...store.sellOrders.values()],
        store.sellOrders.size,
      ],
      findOne: async ({ where }: { where: Record<string, string> }) => {
        const found = store.sellOrders.get(where.id);
        if (!found) {
          return null;
        }
        if (where.sellerUserId && found.sellerUserId !== where.sellerUserId) {
          return null;
        }
        return { ...found };
      },
      find: async () => [...store.sellOrders.values()],
    };

    const buyOrderRepo = {
      findAndCount: async () => [
        [...store.buyOrders.values()],
        store.buyOrders.size,
      ],
      findOne: async ({ where }: { where: Record<string, string> }) => {
        const found = store.buyOrders.get(where.id);
        if (!found) {
          return null;
        }
        if (where.buyerUserId && found.buyerUserId !== where.buyerUserId) {
          return null;
        }
        return { ...found };
      },
      find: async () => [...store.buyOrders.values()],
    };

    const matchingService = {
      getMatchingStatus: jest.fn(),
      listCandidates: jest.fn(),
      selectMatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellOrderService,
        BuyOrderService,
        { provide: DataSource, useValue: dataSource },
        { provide: CoinService, useValue: coinService },
        { provide: UserService, useValue: userService },
        { provide: MatchingService, useValue: matchingService },
        {
          provide: getRepositoryToken(SellOrderEntity),
          useValue: sellOrderRepo,
        },
        {
          provide: getRepositoryToken(SellOrderCoinLotEntity),
          useValue: {
            find: async ({ where }: { where: { sellOrderId: string } }) =>
              store.sellAllocs.filter((a) => a.sellOrderId === where.sellOrderId),
          },
        },
        {
          provide: getRepositoryToken(MatchingPolicyEntity),
          useValue: {
            findOne: async () => [...store.policies.values()][0] ?? null,
            create: (d: Partial<MatchingPolicyEntity>) => d,
            save: async (r: MatchingPolicyEntity) => r,
          },
        },
        {
          provide: getRepositoryToken(BuyOrderEntity),
          useValue: buyOrderRepo,
        },
      ],
    }).compile();

    sellService = module.get(SellOrderService);
    buyService = module.get(BuyOrderService);
  });

  it('Case1: SellOrder 500000 creates lock allocations', async () => {
    const order = await sellService.createSellOrder(
      userId,
      { coinAmount: '500000' },
      'idem-sell-1',
    );

    expect(order.status).toBe(SellOrderStatus.OPEN);
    expect(order.amount.original).toBe('500000');
    expect(order.amount.remaining).toBe('500000');
    expect(order.amount.minimumTrade).toBe('100000');
    expect(store.sellOrders.size).toBe(1);
    expect(store.sellAllocs).toHaveLength(1);
    expect(lockedAmount).toBe(500000n);
    expect(lockCallCount).toBe(1);
  });

  it('Case2: insufficient sellable fails without order', async () => {
    lockedAmount = 400000n; // only 100k left in mock

    await expect(
      sellService.createSellOrder(
        userId,
        { coinAmount: '200000' },
        'idem-sell-fail',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.sellOrders.size).toBe(0);
    expect(store.sellAllocs).toHaveLength(0);
  });

  it('Case3: cancel unlocks full remaining', async () => {
    const created = await sellService.createSellOrder(
      userId,
      { coinAmount: '500000' },
      'idem-sell-3',
    );
    const cancelled = await sellService.cancelSellOrder(userId, created.id);

    expect(cancelled.status).toBe(SellOrderStatus.CANCELLED);
    expect(cancelled.amount.remaining).toBe('0');
    expect(cancelled.amount.cancelled).toBe('500000');
    expect(lockedAmount).toBe(0n);
    expect(store.sellAllocs[0]?.releasedAmount).toBe('500000');
  });

  it('Case4: cancel unlocks only remaining when reserved/completed exist', async () => {
    const created = await sellService.createSellOrder(
      userId,
      { coinAmount: '500000' },
      'idem-sell-4',
    );
    const order = store.sellOrders.get(created.id)!;
    order.remainingCoinAmount = '200000';
    order.reservedCoinAmount = '100000';
    order.completedCoinAmount = '200000';
    store.sellOrders.set(order.id, order);
    // 할당: 500k locked, 200k already "consumed" for completed portion
    store.sellAllocs[0]!.consumedAmount = '200000';
    store.sellAllocs[0]!.releasedAmount = '0';
    // mock wallet still holds 300k locked (reserved+remaining)
    lockedAmount = 300000n;

    const cancelled = await sellService.cancelSellOrder(userId, created.id);
    expect(cancelled.amount.remaining).toBe('0');
    expect(cancelled.amount.reserved).toBe('100000');
    expect(cancelled.amount.completed).toBe('200000');
    expect(cancelled.amount.cancelled).toBe('200000');
    expect(cancelled.status).toBe(SellOrderStatus.CANCELLED);
    expect(coinService.releaseSellableInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: '200000' }),
    );
  });

  it('Case5: BuyOrder create and cancel while MATCHING', async () => {
    const created = await buyService.createBuyOrder(
      userId,
      { coinAmount: '200000' },
      'idem-buy-5',
    );
    expect(created.status).toBe(BuyOrderStatus.MATCHING);

    const cancelled = await buyService.cancelBuyOrder(userId, created.id);
    expect(cancelled.status).toBe(BuyOrderStatus.CANCELLED);
  });

  it('Case6: BuyOrder MATCHED cannot cancel', async () => {
    const created = await buyService.createBuyOrder(
      userId,
      { coinAmount: '200000' },
      'idem-buy-6',
    );
    const order = store.buyOrders.get(created.id)!;
    order.status = BuyOrderStatus.MATCHED;
    store.buyOrders.set(order.id, order);

    await expect(
      buyService.cancelBuyOrder(userId, created.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('Case7: same Idempotency-Key returns same sell order once', async () => {
    const first = await sellService.createSellOrder(
      userId,
      { coinAmount: '500000' },
      'idem-same',
    );
    const second = await sellService.createSellOrder(
      userId,
      { coinAmount: '500000' },
      'idem-same',
    );

    expect(second.id).toBe(first.id);
    expect(store.sellOrders.size).toBe(1);
    expect(lockCallCount).toBe(1);
  });
});
