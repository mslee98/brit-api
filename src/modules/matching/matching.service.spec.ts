import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { BuyMatchType } from '../orders/domain/enums/buy-match-type.enum';
import { BuyOrderStatus } from '../orders/domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../orders/domain/enums/sell-order-status.enum';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../orders/infrastructure/entities/matching-policy.entity';
import { SellOrderCoinLotEntity } from '../orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { TradeService } from '../trades/trade.service';
import { TradeStatus } from '../trades/domain/enums/trade-status.enum';
import { TradeEntity } from '../trades/infrastructure/entities/trade.entity';
import { UserService } from '../users/user.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderRealtimePublisher } from '../orders/realtime/order-realtime.publisher';
import { MatchingAttemptResult } from './domain/enums/matching-attempt-result.enum';
import { TradeRequestRejectionReason } from './domain/enums/trade-request-rejection-reason.enum';
import { TradeRequestStatus } from './domain/enums/trade-request-status.enum';
import { MatchingAttemptEntity } from './infrastructure/entities/matching-attempt.entity';
import { TradeRequestEntity } from './infrastructure/entities/trade-request.entity';
import { MatchingService } from './matching.service';
import { BUY_MATCHING_TIMEOUT_SECONDS } from './domain/constants/matching.constants';
import { TradeRequestReservationService } from './trade-request-reservation.service';

type MatchStore = {
  policy: MatchingPolicyEntity;
  buyOrders: Map<string, BuyOrderEntity>;
  sellOrders: Map<string, SellOrderEntity>;
  sellLots: SellOrderCoinLotEntity[];
  attempts: MatchingAttemptEntity[];
  trades: Map<string, TradeEntity>;
  tradeRequests: Map<string, TradeRequestEntity>;
};

function createPolicy(): MatchingPolicyEntity {
  return {
    id: 'policy-1',
    minSplitRatioBps: 2000,
    buyerPaymentTimeoutSeconds: 300,
    sellerConfirmationTimeoutSeconds: 180,
    maxRematchCount: 3,
    nearMatchMaxRatioBps: 1000,
    tradeRequestTimeoutSeconds: 180,
    isActive: true,
    effectiveFrom: new Date(),
    createdByUserId: null,
    reason: null,
    createdByUser: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function seedSell(
  store: MatchStore,
  params: {
    id: string;
    sellerUserId: string;
    remaining: string;
    reserved?: string;
    minimum: string;
    original?: string;
    status?: SellOrderStatus;
    createdAt?: Date;
  },
): void {
  const original = params.original ?? params.remaining;
  store.sellOrders.set(params.id, {
    id: params.id,
    orderNumber: `SO-${params.id}`,
    sellerUserId: params.sellerUserId,
    matchingPolicyId: store.policy.id,
    originalCoinAmount: original,
    remainingCoinAmount: params.remaining,
    reservedCoinAmount: params.reserved ?? '0',
    completedCoinAmount: '0',
    minimumTradeAmount: params.minimum,
    minSplitRatioBpsSnapshot: 2000,
    status: params.status ?? SellOrderStatus.OPEN,
    idempotencyKey: null,
    coinLots: [],
    createdAt: params.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    cancelledAt: null,
    updatedAt: new Date(),
  } as unknown as SellOrderEntity);

  store.sellLots.push({
    sellOrderId: params.id,
    coinLotId: `lot-${params.id}`,
    lockedAmount: original,
    consumedAmount: '0',
    releasedAmount: '0',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date(),
  } as SellOrderCoinLotEntity);
}

function seedBuy(
  store: MatchStore,
  params: {
    id: string;
    buyerUserId: string;
    amount: string;
    createdAt?: Date;
  },
): BuyOrderEntity {
  const order = {
    id: params.id,
    orderNumber: `BO-${params.id}`,
    buyerUserId: params.buyerUserId,
    coinAmount: params.amount,
    matchedCoinAmount: null,
    matchType: null,
    status: BuyOrderStatus.MATCHING,
    rematchCount: 0,
    nextMatchableAt: null,
    idempotencyKey: null,
    createdAt: params.createdAt ?? new Date(),
    matchedAt: null,
    completedAt: null,
    cancelledAt: null,
    updatedAt: new Date(),
  } as BuyOrderEntity;
  store.buyOrders.set(params.id, order);
  return order;
}

describe('MatchingService (Browse+Select)', () => {
  let matchingService: MatchingService;
  let reservationService: TradeRequestReservationService;
  let store: MatchStore;

  beforeEach(async () => {
    store = {
      policy: createPolicy(),
      buyOrders: new Map(),
      sellOrders: new Map(),
      sellLots: [],
      attempts: [],
      trades: new Map(),
      tradeRequests: new Map(),
    };

    const findTradeRequest = async (opts: {
      where:
        | { id?: string; buyerUserId?: string; idempotencyKey?: string }
        | {
            buyOrderId?: string;
            sellOrderId?: string;
            status?: TradeRequestStatus;
          };
      order?: { createdAt?: 'ASC' | 'DESC' };
    }) => {
      const where = opts.where;
      let rows = [...store.tradeRequests.values()];
      if ('id' in where && where.id) {
        rows = rows.filter((r) => r.id === where.id);
      }
      if ('buyerUserId' in where && where.buyerUserId) {
        rows = rows.filter((r) => r.buyerUserId === where.buyerUserId);
      }
      if ('idempotencyKey' in where && where.idempotencyKey) {
        rows = rows.filter((r) => r.idempotencyKey === where.idempotencyKey);
      }
      if ('buyOrderId' in where && where.buyOrderId) {
        rows = rows.filter((r) => r.buyOrderId === where.buyOrderId);
      }
      if ('sellOrderId' in where && where.sellOrderId) {
        rows = rows.filter((r) => r.sellOrderId === where.sellOrderId);
      }
      if ('status' in where && where.status) {
        rows = rows.filter((r) => r.status === where.status);
      }
      if (opts.order?.createdAt === 'DESC') {
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return rows[0] ?? null;
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        TradeRequestReservationService,
        {
          provide: NotificationService,
          useValue: {
            enqueueTradePushInTransaction: jest.fn(async () => undefined),
          },
        },
        {
          provide: OrderRealtimePublisher,
          useValue: {
            publishBuyOrder: jest.fn(),
            publishSellOrder: jest.fn(),
            publishTradeRequest: jest.fn(),
            publishMatchingChanged: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: async (fn: (m: EntityManager) => Promise<unknown>) => {
              const manager = {
                query: async () => [
                  {
                    nickname: '테스터',
                    completed_count: 0,
                    settled_count: 0,
                  },
                ],
                getRepository: (entity: unknown) => {
                  if (entity === BuyOrderEntity) {
                    return {
                      findOne: async (opts: {
                        where: { id: string; buyerUserId?: string };
                      }) => {
                        const row = store.buyOrders.get(opts.where.id);
                        if (!row) return null;
                        if (
                          opts.where.buyerUserId &&
                          row.buyerUserId !== opts.where.buyerUserId
                        ) {
                          return null;
                        }
                        return row;
                      },
                      save: async (row: BuyOrderEntity) => {
                        store.buyOrders.set(row.id, row);
                        return row;
                      },
                    };
                  }
                  if (entity === SellOrderEntity) {
                    return {
                      findOne: async (opts: { where: { id: string } }) =>
                        store.sellOrders.get(opts.where.id) ?? null,
                      save: async (row: SellOrderEntity) => {
                        store.sellOrders.set(row.id, row);
                        return row;
                      },
                    };
                  }
                  if (entity === SellOrderCoinLotEntity) {
                    return {
                      find: async (opts: { where: { sellOrderId: string } }) =>
                        store.sellLots.filter(
                          (lot) => lot.sellOrderId === opts.where.sellOrderId,
                        ),
                    };
                  }
                  if (entity === MatchingPolicyEntity) {
                    return {
                      findOne: async () => store.policy,
                    };
                  }
                  if (entity === MatchingAttemptEntity) {
                    return {
                      create: (data: Partial<MatchingAttemptEntity>) =>
                        ({
                          id: `attempt-${store.attempts.length + 1}`,
                          ...data,
                        }) as MatchingAttemptEntity,
                      save: async (row: MatchingAttemptEntity) => {
                        store.attempts.push(row);
                        return row;
                      },
                    };
                  }
                  if (entity === TradeRequestEntity) {
                    return {
                      findOne: findTradeRequest,
                      create: (data: Partial<TradeRequestEntity>) =>
                        ({
                          id: `req-${store.tradeRequests.size + 1}`,
                          createdAt: new Date(),
                          updatedAt: new Date(),
                          ...data,
                        }) as TradeRequestEntity,
                      save: async (row: TradeRequestEntity) => {
                        if (!row.id) {
                          row.id = `req-${store.tradeRequests.size + 1}`;
                        }
                        store.tradeRequests.set(row.id, row);
                        return row;
                      },
                    };
                  }
                  if (entity === TradeEntity) {
                    return {
                      findOne: async (opts: {
                        where: { tradeRequestId?: string; id?: string };
                      }) => {
                        if (opts.where.tradeRequestId) {
                          return (
                            [...store.trades.values()].find(
                              (t) =>
                                t.tradeRequestId === opts.where.tradeRequestId,
                            ) ?? null
                          );
                        }
                        if (opts.where.id) {
                          return store.trades.get(opts.where.id) ?? null;
                        }
                        return null;
                      },
                    };
                  }
                  throw new Error('unknown repository');
                },
              } as unknown as EntityManager;
              return fn(manager);
            },
            manager: {
              getRepository: (entity: unknown) => {
                if (entity === MatchingPolicyEntity) {
                  return { findOne: async () => store.policy };
                }
                throw new Error('unknown');
              },
            },
            getRepository: (entity: unknown) => {
              if (entity === TradeEntity) {
                return {
                  findOne: async (opts: {
                    where: { tradeRequestId?: string };
                  }) =>
                    [...store.trades.values()].find(
                      (t) => t.tradeRequestId === opts.where.tradeRequestId,
                    ) ?? null,
                };
              }
              throw new Error('unknown');
            },
            query: async () => [
              {
                nickname: '테스터',
                completed_count: 0,
                settled_count: 0,
              },
            ],
          },
        },
        {
          provide: UserService,
          useValue: {
            getActiveBankAccountPlaintextInTransaction: async (
              _m: EntityManager,
              sellerUserId: string,
            ) =>
              sellerUserId.startsWith('no-bank')
                ? null
                : {
                    bankAccountId: 'bank-1',
                    bankCode: '088',
                    accountNumber: '123',
                    accountHolderName: 'Seller',
                  },
          },
        },
        {
          provide: TradeService,
          useValue: {
            createMatchedTradeInTransaction: async (
              _m: EntityManager,
              input: {
                buyOrderId: string;
                sellOrderId: string;
                coinAmount: string;
                tradeRequestId?: string | null;
              },
            ) => {
              const trade = {
                id: `trade-${store.trades.size + 1}`,
                buyOrderId: input.buyOrderId,
                sellOrderId: input.sellOrderId,
                coinAmount: input.coinAmount,
                tradeRequestId: input.tradeRequestId ?? null,
                status: TradeStatus.WAITING_BUYER_PAYMENT,
              } as TradeEntity;
              store.trades.set(trade.id, trade);
              return trade;
            },
            findByBuyOrderId: async (buyOrderId: string) =>
              [...store.trades.values()].find((t) => t.buyOrderId === buyOrderId) ??
              null,
          },
        },
        {
          provide: getRepositoryToken(BuyOrderEntity),
          useValue: {
            findOne: async (opts: {
              where: { id: string; buyerUserId?: string };
            }) => {
              const row = store.buyOrders.get(opts.where.id);
              if (!row) return null;
              if (
                opts.where.buyerUserId &&
                row.buyerUserId !== opts.where.buyerUserId
              ) {
                return null;
              }
              return row;
            },
            createQueryBuilder: () => ({
              select: () => ({
                where: () => ({
                  andWhere: () => ({
                    orderBy: () => ({
                      take: () => ({
                        getRawMany: async () =>
                          [...store.buyOrders.values()]
                            .filter((o) => o.status === BuyOrderStatus.MATCHING)
                            .filter((o) => {
                              const age =
                                Date.now() - o.createdAt.getTime();
                              return (
                                age >= BUY_MATCHING_TIMEOUT_SECONDS * 1000
                              );
                            })
                            .map((o) => ({ id: o.id })),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          },
        },
        {
          provide: getRepositoryToken(MatchingAttemptEntity),
          useValue: {
            count: async () => store.attempts.length,
            find: async () => store.attempts,
            createQueryBuilder: () => ({
              andWhere: () => ({
                andWhere: () => ({
                  orderBy: () => ({
                    skip: () => ({
                      take: () => ({
                        getManyAndCount: async () => [store.attempts, store.attempts.length],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          },
        },
        {
          provide: getRepositoryToken(TradeRequestEntity),
          useValue: {
            findOne: async (opts: {
              where:
                | { id?: string; buyerUserId?: string; idempotencyKey?: string }
                | {
                    buyOrderId?: string;
                    sellOrderId?: string;
                    status?: TradeRequestStatus;
                  };
              order?: { createdAt?: 'ASC' | 'DESC' };
            }) => {
              const where = opts.where;
              let rows = [...store.tradeRequests.values()];
              if ('id' in where && where.id) {
                rows = rows.filter((r) => r.id === where.id);
              }
              if ('buyerUserId' in where && where.buyerUserId) {
                rows = rows.filter((r) => r.buyerUserId === where.buyerUserId);
              }
              if ('idempotencyKey' in where && where.idempotencyKey) {
                rows = rows.filter(
                  (r) => r.idempotencyKey === where.idempotencyKey,
                );
              }
              if ('buyOrderId' in where && where.buyOrderId) {
                rows = rows.filter((r) => r.buyOrderId === where.buyOrderId);
              }
              if ('sellOrderId' in where && where.sellOrderId) {
                rows = rows.filter((r) => r.sellOrderId === where.sellOrderId);
              }
              if ('status' in where && where.status) {
                rows = rows.filter((r) => r.status === where.status);
              }
              if (opts.order?.createdAt === 'DESC') {
                rows.sort(
                  (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
                );
              }
              return rows[0] ?? null;
            },
            createQueryBuilder: () => ({
              select: () => ({
                where: () => ({
                  andWhere: () => ({
                    orderBy: () => ({
                      take: () => ({
                        getRawMany: async () =>
                          [...store.tradeRequests.values()]
                            .filter(
                              (r) =>
                                r.status === TradeRequestStatus.PENDING_SELLER,
                            )
                            .filter((r) => r.expiresAt.getTime() <= Date.now())
                            .sort(
                              (a, b) =>
                                a.expiresAt.getTime() - b.expiresAt.getTime(),
                            )
                            .map((r) => ({ id: r.id })),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          },
        },
      ],
    }).compile();

    matchingService = module.get(MatchingService);
    reservationService = module.get(TradeRequestReservationService);
  });

  it('computeMatch Exact / Near / out of range', () => {
    expect(
      matchingService.computeMatch('500000', '500000', 1000),
    ).toEqual({ matchType: BuyMatchType.EXACT, coinAmount: '500000' });
    expect(
      matchingService.computeMatch('500000', '487000', 1000),
    ).toEqual({ matchType: BuyMatchType.NEAR, coinAmount: '487000' });
    expect(matchingService.computeMatch('500000', '10000', 1000)).toBeNull();
  });

  it('selectMatch Exact creates Trade', async () => {
    seedBuy(store, {
      id: 'buy-1',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-1',
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });

    const result = await matchingService.selectMatch('buyer', 'buy-1', {
      sellOrderId: 'sell-1',
      expectedMatchType: BuyMatchType.EXACT,
      expectedCoinAmount: '500000',
    });

    expect(result.tradeId).toBeTruthy();
    expect(result.match.type).toBe(BuyMatchType.EXACT);
    expect(store.buyOrders.get('buy-1')!.status).toBe(BuyOrderStatus.MATCHED);
    expect(store.buyOrders.get('buy-1')!.matchedCoinAmount).toBe('500000');
    expect(store.sellOrders.get('sell-1')!.remainingCoinAmount).toBe('0');
    expect(store.attempts[0].result).toBe(MatchingAttemptResult.MATCHED);
  });

  it('selectMatch Near uses sell remaining as trade amount', async () => {
    seedBuy(store, {
      id: 'buy-near',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-near',
      sellerUserId: 'seller',
      remaining: '487000',
      minimum: '100000',
    });

    const result = await matchingService.selectMatch('buyer', 'buy-near', {
      sellOrderId: 'sell-near',
      expectedMatchType: BuyMatchType.NEAR,
      expectedCoinAmount: '487000',
    });

    expect(result.match).toEqual({
      type: BuyMatchType.NEAR,
      coinAmount: '487000',
    });
    expect(store.buyOrders.get('buy-near')!.matchedCoinAmount).toBe('487000');
    expect(store.buyOrders.get('buy-near')!.matchType).toBe(BuyMatchType.NEAR);
  });

  it('selectMatch throws CANDIDATE_CHANGED on expected mismatch', async () => {
    seedBuy(store, {
      id: 'buy-2',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-2',
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });

    await expect(
      matchingService.selectMatch('buyer', 'buy-2', {
        sellOrderId: 'sell-2',
        expectedMatchType: BuyMatchType.NEAR,
        expectedCoinAmount: '500000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('selectMatch throws SELL_ORDER_UNAVAILABLE when sell already reserved', async () => {
    seedBuy(store, {
      id: 'buy-3',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-3',
      sellerUserId: 'seller',
      remaining: '0',
      reserved: '500000',
      original: '500000',
      minimum: '100000',
      status: SellOrderStatus.FULLY_RESERVED,
    });

    await expect(
      matchingService.selectMatch('buyer', 'buy-3', {
        sellOrderId: 'sell-3',
        expectedMatchType: BuyMatchType.EXACT,
        expectedCoinAmount: '500000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('expireBuyOrder marks timed-out MATCHING as EXPIRED', async () => {
    const old = new Date(
      Date.now() - (BUY_MATCHING_TIMEOUT_SECONDS + 10) * 1000,
    );
    seedBuy(store, {
      id: 'buy-old',
      buyerUserId: 'buyer',
      amount: '100000',
      createdAt: old,
    });

    await matchingService.expireBuyOrder('buy-old');
    expect(store.buyOrders.get('buy-old')!.status).toBe(BuyOrderStatus.EXPIRED);
  });

  it('applyToSellOrder Exact reserves sell and sets REQUEST_PENDING', async () => {
    seedBuy(store, {
      id: 'buy-apply',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-apply',
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });

    const result = await matchingService.applyToSellOrder(
      'buyer',
      'buy-apply',
      {
        sellOrderId: 'sell-apply',
        expectedMatchType: BuyMatchType.EXACT,
        expectedCoinAmount: '500000',
      },
      'idem-apply-1',
    );

    expect(result.tradeRequestId).toBeTruthy();
    expect(result.status).toBe(TradeRequestStatus.PENDING_SELLER);
    expect(result.match).toEqual({
      type: BuyMatchType.EXACT,
      coinAmount: '500000',
    });
    expect(store.buyOrders.get('buy-apply')!.status).toBe(
      BuyOrderStatus.REQUEST_PENDING,
    );
    expect(store.sellOrders.get('sell-apply')!.remainingCoinAmount).toBe('0');
    expect(store.sellOrders.get('sell-apply')!.reservedCoinAmount).toBe(
      '500000',
    );
    expect(store.trades.size).toBe(0);
    expect(store.attempts.length).toBe(0);
  });

  it('applyToSellOrder Near uses sell remaining as snapshot', async () => {
    seedBuy(store, {
      id: 'buy-apply-near',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-apply-near',
      sellerUserId: 'seller',
      remaining: '487000',
      minimum: '100000',
    });

    const result = await matchingService.applyToSellOrder(
      'buyer',
      'buy-apply-near',
      {
        sellOrderId: 'sell-apply-near',
        expectedMatchType: BuyMatchType.NEAR,
        expectedCoinAmount: '487000',
      },
      'idem-near',
    );

    expect(result.match).toEqual({
      type: BuyMatchType.NEAR,
      coinAmount: '487000',
    });
    expect(store.sellOrders.get('sell-apply-near')!.remainingCoinAmount).toBe(
      '0',
    );
    expect(store.sellOrders.get('sell-apply-near')!.reservedCoinAmount).toBe(
      '487000',
    );
  });

  it('applyToSellOrder throws CANDIDATE_CHANGED without mutating sell', async () => {
    seedBuy(store, {
      id: 'buy-apply-changed',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-apply-changed',
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });

    await expect(
      matchingService.applyToSellOrder(
        'buyer',
        'buy-apply-changed',
        {
          sellOrderId: 'sell-apply-changed',
          expectedMatchType: BuyMatchType.NEAR,
          expectedCoinAmount: '500000',
        },
        'idem-changed',
      ),
    ).rejects.toMatchObject({
      response: { code: 'CANDIDATE_CHANGED' },
    });

    expect(store.sellOrders.get('sell-apply-changed')!.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get('sell-apply-changed')!.reservedCoinAmount).toBe(
      '0',
    );
    expect(store.tradeRequests.size).toBe(0);
  });

  it('applyToSellOrder idempotency returns same tradeRequestId', async () => {
    seedBuy(store, {
      id: 'buy-idem',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-idem',
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });

    const first = await matchingService.applyToSellOrder(
      'buyer',
      'buy-idem',
      {
        sellOrderId: 'sell-idem',
        expectedMatchType: BuyMatchType.EXACT,
        expectedCoinAmount: '500000',
      },
      'same-key',
    );
    const second = await matchingService.applyToSellOrder(
      'buyer',
      'buy-idem',
      {
        sellOrderId: 'sell-idem',
        expectedMatchType: BuyMatchType.EXACT,
        expectedCoinAmount: '500000',
      },
      'same-key',
    );

    expect(second.tradeRequestId).toBe(first.tradeRequestId);
    expect(store.tradeRequests.size).toBe(1);
  });

  it('applyToSellOrder second apply on same buy throws BUY_ORDER_PENDING_REQUEST', async () => {
    seedBuy(store, {
      id: 'buy-twice',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-twice-a',
      sellerUserId: 'seller-a',
      remaining: '500000',
      minimum: '100000',
    });
    seedSell(store, {
      id: 'sell-twice-b',
      sellerUserId: 'seller-b',
      remaining: '500000',
      minimum: '100000',
    });

    await matchingService.applyToSellOrder(
      'buyer',
      'buy-twice',
      {
        sellOrderId: 'sell-twice-a',
        expectedMatchType: BuyMatchType.EXACT,
        expectedCoinAmount: '500000',
      },
      'key-a',
    );

    await expect(
      matchingService.applyToSellOrder(
        'buyer',
        'buy-twice',
        {
          sellOrderId: 'sell-twice-b',
          expectedMatchType: BuyMatchType.EXACT,
          expectedCoinAmount: '500000',
        },
        'key-b',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BUY_ORDER_PENDING_REQUEST' },
    });
  });

  it('applyToSellOrder second buyer on same sell throws SELL_ORDER_PENDING_REQUEST', async () => {
    seedBuy(store, {
      id: 'buy-b2',
      buyerUserId: 'buyer-2',
      amount: '500000',
    });
    seedSell(store, {
      id: 'sell-contested',
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });
    store.tradeRequests.set('req-existing', {
      id: 'req-existing',
      buyOrderId: 'buy-b1',
      sellOrderId: 'sell-contested',
      buyerUserId: 'buyer-1',
      sellerUserId: 'seller',
      requestedCoinAmount: '500000',
      matchType: BuyMatchType.EXACT,
      status: TradeRequestStatus.PENDING_SELLER,
      expiresAt: new Date(Date.now() + 180_000),
      rejectionReasonCode: null,
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      expiredAt: null,
      idempotencyKey: 'buyer1-key',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TradeRequestEntity);

    await expect(
      matchingService.applyToSellOrder(
        'buyer-2',
        'buy-b2',
        {
          sellOrderId: 'sell-contested',
          expectedMatchType: BuyMatchType.EXACT,
          expectedCoinAmount: '500000',
        },
        'buyer2-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SELL_ORDER_PENDING_REQUEST' },
    });
  });

  it('listCandidates while REQUEST_PENDING throws BUY_ORDER_REQUEST_PENDING', async () => {
    seedBuy(store, {
      id: 'buy-cand',
      buyerUserId: 'buyer',
      amount: '500000',
    });
    store.buyOrders.get('buy-cand')!.status = BuyOrderStatus.REQUEST_PENDING;

    await expect(
      matchingService.listCandidates('buyer', 'buy-cand', {
        type: BuyMatchType.EXACT,
      }),
    ).rejects.toMatchObject({
      response: { code: 'BUY_ORDER_REQUEST_PENDING' },
    });
  });

  async function applyExact(
    buyId: string,
    sellId: string,
    key: string,
  ): Promise<string> {
    seedBuy(store, {
      id: buyId,
      buyerUserId: 'buyer',
      amount: '500000',
    });
    seedSell(store, {
      id: sellId,
      sellerUserId: 'seller',
      remaining: '500000',
      minimum: '100000',
    });
    const applied = await matchingService.applyToSellOrder(
      'buyer',
      buyId,
      {
        sellOrderId: sellId,
        expectedMatchType: BuyMatchType.EXACT,
        expectedCoinAmount: '500000',
      },
      key,
    );
    return applied.tradeRequestId;
  }

  it('acceptTradeRequest creates Trade without changing sell rem/res', async () => {
    const reqId = await applyExact('buy-acc', 'sell-acc', 'idem-acc');
    const sellBefore = store.sellOrders.get('sell-acc')!;
    const remBefore = sellBefore.remainingCoinAmount;
    const resBefore = sellBefore.reservedCoinAmount;

    const result = await matchingService.acceptTradeRequest('seller', reqId);

    expect(result.tradeId).toBeTruthy();
    expect(result.tradeStatus).toBe(TradeStatus.WAITING_BUYER_PAYMENT);
    expect(store.trades.size).toBe(1);
    expect(store.trades.get(result.tradeId)!.tradeRequestId).toBe(reqId);
    expect(store.buyOrders.get('buy-acc')!.status).toBe(BuyOrderStatus.MATCHED);
    expect(store.buyOrders.get('buy-acc')!.matchedCoinAmount).toBe('500000');
    expect(store.tradeRequests.get(reqId)!.status).toBe(
      TradeRequestStatus.ACCEPTED,
    );
    expect(store.sellOrders.get('sell-acc')!.remainingCoinAmount).toBe(
      remBefore,
    );
    expect(store.sellOrders.get('sell-acc')!.reservedCoinAmount).toBe(
      resBefore,
    );
  });

  it('acceptTradeRequest is idempotent', async () => {
    const reqId = await applyExact('buy-idem-acc', 'sell-idem-acc', 'idem-acc-2');
    const first = await matchingService.acceptTradeRequest('seller', reqId);
    const second = await matchingService.acceptTradeRequest('seller', reqId);
    expect(second.tradeId).toBe(first.tradeId);
    expect(store.trades.size).toBe(1);
  });

  it('rejectTradeRequest releases reservation and Buy MATCHING', async () => {
    const reqId = await applyExact('buy-rej', 'sell-rej', 'idem-rej');

    const result = await matchingService.rejectTradeRequest(
      'seller',
      reqId,
      TradeRequestRejectionReason.NOT_AVAILABLE_NOW,
    );

    expect(result.status).toBe(TradeRequestStatus.REJECTED);
    expect(result.rejectionReasonCode).toBe(
      TradeRequestRejectionReason.NOT_AVAILABLE_NOW,
    );
    expect(store.sellOrders.get('sell-rej')!.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get('sell-rej')!.reservedCoinAmount).toBe('0');
    expect(store.buyOrders.get('buy-rej')!.status).toBe(BuyOrderStatus.MATCHING);
    expect(store.trades.size).toBe(0);
  });

  it('cancelTradeRequest releases reservation and Buy MATCHING', async () => {
    const reqId = await applyExact('buy-can', 'sell-can', 'idem-can');

    const result = await matchingService.cancelTradeRequest('buyer', reqId);

    expect(result.status).toBe(TradeRequestStatus.CANCELLED_BY_BUYER);
    expect(store.sellOrders.get('sell-can')!.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get('sell-can')!.reservedCoinAmount).toBe('0');
    expect(store.buyOrders.get('buy-can')!.status).toBe(BuyOrderStatus.MATCHING);
  });

  it('acceptTradeRequest after expires_at throws TRADE_REQUEST_EXPIRED', async () => {
    const reqId = await applyExact('buy-exp', 'sell-exp', 'idem-exp');
    store.tradeRequests.get(reqId)!.expiresAt = new Date(Date.now() - 1000);

    await expect(
      matchingService.acceptTradeRequest('seller', reqId),
    ).rejects.toMatchObject({
      response: { code: 'TRADE_REQUEST_EXPIRED' },
    });
    expect(store.trades.size).toBe(0);
  });

  it('acceptTradeRequest with broken reservation throws REQUEST_STALE', async () => {
    const reqId = await applyExact('buy-stale', 'sell-stale', 'idem-stale');
    store.sellOrders.get('sell-stale')!.reservedCoinAmount = '0';

    await expect(
      matchingService.acceptTradeRequest('seller', reqId),
    ).rejects.toMatchObject({
      response: { code: 'REQUEST_STALE' },
    });
    expect(store.trades.size).toBe(0);
  });

  it('expireTradeRequest releases reservation and Buy MATCHING', async () => {
    const reqId = await applyExact('buy-ttl-req', 'sell-ttl-req', 'idem-ttl-req');
    store.tradeRequests.get(reqId)!.expiresAt = new Date(Date.now() - 1000);

    await matchingService.expireTradeRequest(reqId);

    expect(store.tradeRequests.get(reqId)!.status).toBe(
      TradeRequestStatus.EXPIRED,
    );
    expect(store.sellOrders.get('sell-ttl-req')!.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get('sell-ttl-req')!.reservedCoinAmount).toBe('0');
    expect(store.buyOrders.get('buy-ttl-req')!.status).toBe(
      BuyOrderStatus.MATCHING,
    );
  });

  it('expireTradeRequest after Accept is no-op', async () => {
    const reqId = await applyExact(
      'buy-acc-exp',
      'sell-acc-exp',
      'idem-acc-exp',
    );
    await matchingService.acceptTradeRequest('seller', reqId);
    const rem = store.sellOrders.get('sell-acc-exp')!.remainingCoinAmount;
    const res = store.sellOrders.get('sell-acc-exp')!.reservedCoinAmount;

    store.tradeRequests.get(reqId)!.expiresAt = new Date(Date.now() - 1000);
    await matchingService.expireTradeRequest(reqId);

    expect(store.tradeRequests.get(reqId)!.status).toBe(
      TradeRequestStatus.ACCEPTED,
    );
    expect(store.trades.size).toBe(1);
    expect(store.sellOrders.get('sell-acc-exp')!.remainingCoinAmount).toBe(rem);
    expect(store.sellOrders.get('sell-acc-exp')!.reservedCoinAmount).toBe(res);
  });

  it('acceptTradeRequest after expire throws TRADE_REQUEST_EXPIRED', async () => {
    const reqId = await applyExact(
      'buy-exp-acc',
      'sell-exp-acc',
      'idem-exp-acc',
    );
    store.tradeRequests.get(reqId)!.expiresAt = new Date(Date.now() - 1000);
    await matchingService.expireTradeRequest(reqId);

    await expect(
      matchingService.acceptTradeRequest('seller', reqId),
    ).rejects.toMatchObject({
      response: { code: 'TRADE_REQUEST_EXPIRED' },
    });
  });

  it('acceptTradeRequest after cancel throws TRADE_REQUEST_NOT_PENDING', async () => {
    const reqId = await applyExact(
      'buy-can-acc',
      'sell-can-acc',
      'idem-can-acc',
    );
    await matchingService.cancelTradeRequest('buyer', reqId);

    await expect(
      matchingService.acceptTradeRequest('seller', reqId),
    ).rejects.toMatchObject({
      response: { code: 'TRADE_REQUEST_NOT_PENDING' },
    });
  });

  it('expireBuyOrder does not expire REQUEST_PENDING Buy', async () => {
    const old = new Date(
      Date.now() - (BUY_MATCHING_TIMEOUT_SECONDS + 10) * 1000,
    );
    const reqId = await applyExact(
      'buy-pending-ttl',
      'sell-pending-ttl',
      'idem-pending-ttl',
    );
    store.buyOrders.get('buy-pending-ttl')!.createdAt = old;

    const expiredIds =
      await matchingService.findExpiredMatchingBuyOrderIds(50);
    expect(expiredIds).not.toContain('buy-pending-ttl');

    await matchingService.expireBuyOrder('buy-pending-ttl');
    expect(store.buyOrders.get('buy-pending-ttl')!.status).toBe(
      BuyOrderStatus.REQUEST_PENDING,
    );
    expect(store.tradeRequests.get(reqId)!.status).toBe(
      TradeRequestStatus.PENDING_SELLER,
    );
  });

  it('release twice after reject restores reserved only once', async () => {
    const reqId = await applyExact(
      'buy-rel2',
      'sell-rel2',
      'idem-rel2',
    );
    await matchingService.rejectTradeRequest(
      'seller',
      reqId,
      TradeRequestRejectionReason.OTHER,
    );
    const sell = store.sellOrders.get('sell-rel2')!;
    expect(sell.remainingCoinAmount).toBe('500000');
    expect(sell.reservedCoinAmount).toBe('0');

    await matchingService['dataSource'].transaction(async (manager) => {
      await reservationService.release(
        manager,
        store.tradeRequests.get(reqId)!,
      );
    });

    expect(store.sellOrders.get('sell-rel2')!.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get('sell-rel2')!.reservedCoinAmount).toBe('0');
    const original = BigInt(sell.originalCoinAmount);
    const rem = BigInt(store.sellOrders.get('sell-rel2')!.remainingCoinAmount);
    const res = BigInt(store.sellOrders.get('sell-rel2')!.reservedCoinAmount);
    const comp = BigInt(store.sellOrders.get('sell-rel2')!.completedCoinAmount);
    expect(rem + res + comp).toBe(original);
  });

  it('findExpiredPendingTradeRequestIds returns past PENDING only', async () => {
    const reqId = await applyExact(
      'buy-find-exp',
      'sell-find-exp',
      'idem-find-exp',
    );
    expect(await matchingService.findExpiredPendingTradeRequestIds(50)).toEqual(
      [],
    );
    store.tradeRequests.get(reqId)!.expiresAt = new Date(Date.now() - 1000);
    expect(await matchingService.findExpiredPendingTradeRequestIds(50)).toEqual(
      [reqId],
    );
  });
});
