import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { AuditLogEntity } from '../admins/infrastructure/entities/audit-log.entity';
import { BanksService } from '../banks/banks.service';
import { CoinService } from '../coins/coin.service';
import { NotificationService } from '../notifications/notification.service';
import { CoinLedgerEntryType } from '../coins/domain/enums/coin-ledger-entry-type.enum';
import { CoinLotStatus } from '../coins/domain/enums/coin-lot-status.enum';
import { CoinSourceType } from '../coins/domain/enums/coin-source-type.enum';
import { CoinWalletStatus } from '../coins/domain/enums/coin-wallet-status.enum';
import { CoinLedgerEntryEntity } from '../coins/infrastructure/entities/coin-ledger-entry.entity';
import { CoinPurchaseEntity } from '../coins/infrastructure/entities/coin-purchase.entity';
import { UserCoinLotEntity } from '../coins/infrastructure/entities/user-coin-lot.entity';
import { UserCoinWalletEntity } from '../coins/infrastructure/entities/user-coin-wallet.entity';
import { BuyOrderStatus } from '../orders/domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../orders/domain/enums/sell-order-status.enum';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../orders/infrastructure/entities/matching-policy.entity';
import { OrderNumberSequenceEntity } from '../orders/infrastructure/entities/order-number-sequence.entity';
import { SellOrderCoinLotEntity } from '../orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { UserService } from '../users/user.service';
import { TradeEventActorType } from './domain/enums/trade-event-actor-type.enum';
import { TradeEventCode } from './domain/enums/trade-event-code.enum';
import { TradeStatus } from './domain/enums/trade-status.enum';
import { TradeCoinLotEntity } from './infrastructure/entities/trade-coin-lot.entity';
import { TradeDisputeEntity } from './infrastructure/entities/trade-dispute.entity';
import { TradeEventEntity } from './infrastructure/entities/trade-event.entity';
import { TradeEntity } from './infrastructure/entities/trade.entity';
import { TradeService } from './trade.service';

const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const TRADE_ID = 'trade-1';
const BUY_ORDER_ID = 'buy-1';
const SELL_ORDER_ID = 'sell-1';
const LOT_ID = 'lot-seller-1';

type Store = {
  trades: Map<string, TradeEntity>;
  events: TradeEventEntity[];
  tradeLots: Map<string, TradeCoinLotEntity>;
  disputes: Map<string, TradeDisputeEntity>;
  buyOrders: Map<string, BuyOrderEntity>;
  sellOrders: Map<string, SellOrderEntity>;
  matchingPolicies: Map<string, MatchingPolicyEntity>;
  sellLots: SellOrderCoinLotEntity[];
  sequences: Map<string, OrderNumberSequenceEntity>;
  wallets: Map<string, UserCoinWalletEntity>;
  lots: Map<string, UserCoinLotEntity>;
  ledgers: CoinLedgerEntryEntity[];
};

function lotKey(tradeId: string, coinLotId: string): string {
  return `${tradeId}:${coinLotId}`;
}

function createStore(): Store {
  return {
    trades: new Map(),
    events: [],
    tradeLots: new Map(),
    disputes: new Map(),
    buyOrders: new Map(),
    sellOrders: new Map(),
    matchingPolicies: new Map(),
    sellLots: [],
    sequences: new Map(),
    wallets: new Map(),
    lots: new Map(),
    ledgers: [],
  };
}

function seedWallet(store: Store, userId: string, locked: string): void {
  store.wallets.set(userId, {
    userId,
    nonSellableBalance: '0',
    sellableBalance: '0',
    lockedNonSellableBalance: '0',
    lockedSellableBalance: locked,
    pendingSellableBalance: '0',
    status: CoinWalletStatus.ACTIVE,
    version: 0,
  } as UserCoinWalletEntity);
}

function seedMatchedTrade(
  store: Store,
  overrides: Partial<TradeEntity> = {},
): TradeEntity {
  const now = new Date();
  const trade = {
    id: TRADE_ID,
    tradeNumber: 'TO-20260815-000001',
    buyOrderId: BUY_ORDER_ID,
    sellOrderId: SELL_ORDER_ID,
    buyerUserId: BUYER_ID,
    sellerUserId: SELLER_ID,
    sellerBankAccountId: 'bank-acc-1',
    sellerBankCode: '088',
    sellerAccountNumber: '110123456789',
    sellerAccountHolderName: '김민성',
    coinAmount: '200000',
    paymentAmount: '200000',
    status: TradeStatus.WAITING_BUYER_PAYMENT,
    buyerPaymentTimeoutSeconds: 300,
    buyerPaymentDueAt: new Date(now.getTime() + 300_000),
    sellerConfirmationTimeoutSeconds: 180,
    sellerConfirmationDueAt: null,
    buyerReportedPaidAt: null,
    sellerConfirmedAt: null,
    coinTransferStartedAt: null,
    coinTransferredAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as TradeEntity;
  store.trades.set(trade.id, trade);

  store.buyOrders.set(BUY_ORDER_ID, {
    id: BUY_ORDER_ID,
    orderNumber: 'BO-1',
    buyerUserId: BUYER_ID,
    coinAmount: '200000',
    status: BuyOrderStatus.MATCHED,
    rematchCount: 0,
    nextMatchableAt: null,
    idempotencyKey: null,
    createdAt: now,
    matchedAt: now,
    completedAt: null,
    cancelledAt: null,
    updatedAt: now,
  } as BuyOrderEntity);

  store.sellOrders.set(SELL_ORDER_ID, {
    id: SELL_ORDER_ID,
    orderNumber: 'SO-1',
    sellerUserId: SELLER_ID,
    matchingPolicyId: 'policy-1',
    originalCoinAmount: '500000',
    remainingCoinAmount: '300000',
    reservedCoinAmount: '200000',
    completedCoinAmount: '0',
    minimumTradeAmount: '10000',
    minSplitRatioBpsSnapshot: 2000,
    status: SellOrderStatus.PARTIALLY_MATCHED,
    idempotencyKey: null,
    createdAt: now,
    completedAt: null,
    cancelledAt: null,
    updatedAt: now,
  } as SellOrderEntity);

  store.matchingPolicies.set('policy-1', {
    id: 'policy-1',
    minSplitRatioBps: 2000,
    buyerPaymentTimeoutSeconds: 300,
    sellerConfirmationTimeoutSeconds: 180,
    maxRematchCount: 3,
    nearMatchMaxRatioBps: 1000,
    isActive: true,
    effectiveFrom: now,
    createdByUserId: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
  } as MatchingPolicyEntity);

  store.sellLots.push({
    sellOrderId: SELL_ORDER_ID,
    coinLotId: LOT_ID,
    lockedAmount: '500000',
    consumedAmount: '0',
    releasedAmount: '0',
    createdAt: now,
    updatedAt: now,
  } as SellOrderCoinLotEntity);

  store.tradeLots.set(lotKey(TRADE_ID, LOT_ID), {
    tradeId: TRADE_ID,
    coinLotId: LOT_ID,
    allocatedAmount: '200000',
    transferredAmount: '0',
    returnedAmount: '0',
    createdAt: now,
    updatedAt: now,
  } as TradeCoinLotEntity);

  store.lots.set(LOT_ID, {
    id: LOT_ID,
    userId: SELLER_ID,
    sourceType: CoinSourceType.ADMIN_ADJUSTMENT,
    sourceId: null,
    originalAmount: '500000',
    remainingAmount: '0',
    lockedAmount: '500000',
    consumedAmount: '0',
    isSellable: true,
    status: CoinLotStatus.PARTIALLY_USED,
    availableAt: now,
    consumedAt: null,
    createdAt: now,
    updatedAt: now,
  } as UserCoinLotEntity);

  seedWallet(store, SELLER_ID, '500000');
  seedWallet(store, BUYER_ID, '0');

  store.events.push({
    id: 'evt-created',
    tradeId: TRADE_ID,
    previousStatus: null,
    newStatus: TradeStatus.WAITING_BUYER_PAYMENT,
    eventCode: TradeEventCode.TRADE_CREATED,
    actorType: TradeEventActorType.SYSTEM,
    actorUserId: null,
    message: null,
    metadata: null,
    createdAt: now,
  } as TradeEventEntity);

  return trade;
}

function makeManager(store: Store): EntityManager {
  const getTradeRepo = () => ({
    findOne: async ({ where }: { where: { id?: string } }) => {
      const found = where.id ? store.trades.get(where.id) : undefined;
      return found ? { ...found } : null;
    },
    save: async (row: TradeEntity) => {
      store.trades.set(row.id, { ...row });
      return { ...row };
    },
    create: (data: Partial<TradeEntity>) => ({ ...data }) as TradeEntity,
    findAndCount: async () => [[...store.trades.values()], store.trades.size],
    find: async () => [...store.trades.values()].map((row) => ({ ...row })),
  });

  const getEventRepo = () => ({
    create: (data: Partial<TradeEventEntity>) =>
      ({
        id: `evt-${store.events.length + 1}`,
        createdAt: new Date(),
        ...data,
      }) as TradeEventEntity,
    save: async (row: TradeEventEntity) => {
      const saved = { ...row, id: row.id ?? `evt-${store.events.length + 1}` };
      const idx = store.events.findIndex((item) => item.id === saved.id);
      if (idx >= 0) {
        store.events[idx] = saved;
      } else {
        store.events.push(saved);
      }
      return saved;
    },
    find: async ({
      where,
      take,
    }: {
      where: { tradeId: string; eventCode?: string };
      take?: number;
    }) => {
      let rows = store.events.filter((event) => event.tradeId === where.tradeId);
      if (where.eventCode) {
        rows = rows.filter((event) => event.eventCode === where.eventCode);
      }
      rows = rows.map((event) => ({ ...event }));
      return take ? rows.slice(0, take) : rows;
    },
    findOne: async ({
      where,
    }: {
      where: { tradeId: string; eventCode?: string };
    }) => {
      const rows = store.events.filter((event) => {
        if (event.tradeId !== where.tradeId) {
          return false;
        }
        if (where.eventCode && event.eventCode !== where.eventCode) {
          return false;
        }
        return true;
      });
      return rows[0] ? { ...rows[0] } : null;
    },
  });

  return {
    getRepository: (entity: unknown) => {
      if (entity === TradeEntity) {
        return getTradeRepo();
      }
      if (entity === TradeEventEntity) {
        return getEventRepo();
      }
      if (entity === TradeCoinLotEntity) {
        return {
          find: async ({
            where,
          }: {
            where: { tradeId: string };
          }) =>
            [...store.tradeLots.values()]
              .filter((lot) => lot.tradeId === where.tradeId)
              .map((lot) => ({ ...lot })),
          save: async (row: TradeCoinLotEntity) => {
            store.tradeLots.set(lotKey(row.tradeId, row.coinLotId), { ...row });
            return { ...row };
          },
          create: (data: Partial<TradeCoinLotEntity>) =>
            ({ ...data }) as TradeCoinLotEntity,
        };
      }
      if (entity === TradeDisputeEntity) {
        return {
          findOne: async ({ where }: { where: { tradeId: string } }) => {
            const found = [...store.disputes.values()].find(
              (row) => row.tradeId === where.tradeId,
            );
            return found ? { ...found } : null;
          },
          create: (data: Partial<TradeDisputeEntity>) =>
            ({ id: `disp-${store.disputes.size + 1}`, ...data }) as TradeDisputeEntity,
          save: async (row: TradeDisputeEntity) => {
            if (!row.id) {
              row.id = `disp-${store.disputes.size + 1}`;
            }
            store.disputes.set(row.id, { ...row });
            return { ...row };
          },
        };
      }
      if (entity === BuyOrderEntity) {
        return {
          findOne: async ({ where }: { where: { id: string } }) => {
            const found = store.buyOrders.get(where.id);
            return found ? { ...found } : null;
          },
          save: async (row: BuyOrderEntity) => {
            store.buyOrders.set(row.id, { ...row });
            return { ...row };
          },
        };
      }
      if (entity === SellOrderEntity) {
        return {
          findOne: async ({ where }: { where: { id: string } }) => {
            const found = store.sellOrders.get(where.id);
            return found ? { ...found } : null;
          },
          save: async (row: SellOrderEntity) => {
            store.sellOrders.set(row.id, { ...row });
            return { ...row };
          },
        };
      }
      if (entity === SellOrderCoinLotEntity) {
        return {
          findOne: async ({
            where,
          }: {
            where: { sellOrderId: string; coinLotId: string };
          }) => {
            const found = store.sellLots.find(
              (lot) =>
                lot.sellOrderId === where.sellOrderId &&
                lot.coinLotId === where.coinLotId,
            );
            return found ? { ...found } : null;
          },
          save: async (row: SellOrderCoinLotEntity) => {
            const idx = store.sellLots.findIndex(
              (lot) =>
                lot.sellOrderId === row.sellOrderId &&
                lot.coinLotId === row.coinLotId,
            );
            if (idx >= 0) {
              store.sellLots[idx] = { ...row };
            } else {
              store.sellLots.push({ ...row });
            }
            return { ...row };
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
            const found = store.sequences.get(key);
            return found ? { ...found } : null;
          },
          findOneOrFail: async ({
            where,
          }: {
            where: { prefix: string; yyyymmdd: string };
          }) => {
            const key = `${where.prefix}:${where.yyyymmdd}`;
            const found = store.sequences.get(key);
            if (!found) {
              throw new Error('seq missing');
            }
            return { ...found };
          },
          create: (data: Partial<OrderNumberSequenceEntity>) =>
            ({ lastValue: 0, ...data }) as OrderNumberSequenceEntity,
          save: async (row: OrderNumberSequenceEntity) => {
            store.sequences.set(`${row.prefix}:${row.yyyymmdd}`, { ...row });
            return { ...row };
          },
        };
      }
      if (entity === UserCoinWalletEntity) {
        return {
          findOne: async ({ where }: { where: { userId: string } }) => {
            const found = store.wallets.get(where.userId);
            return found ? { ...found } : null;
          },
          save: async (row: UserCoinWalletEntity) => {
            store.wallets.set(row.userId, { ...row });
            return { ...row };
          },
        };
      }
      if (entity === UserCoinLotEntity) {
        return {
          create: (data: Partial<UserCoinLotEntity>) =>
            ({ ...data }) as UserCoinLotEntity,
          save: async (row: UserCoinLotEntity) => {
            if (!row.id) {
              row.id = `lot-${store.lots.size + 1}`;
            }
            store.lots.set(row.id, { ...row });
            return { ...row };
          },
          findOne: async ({
            where,
          }: {
            where: { id: string; userId?: string };
          }) => {
            const found = store.lots.get(where.id);
            if (!found) {
              return null;
            }
            if (where.userId && found.userId !== where.userId) {
              return null;
            }
            return { ...found };
          },
          find: async () => [...store.lots.values()].map((lot) => ({ ...lot })),
        };
      }
      if (entity === CoinLedgerEntryEntity) {
        return {
          create: (data: Partial<CoinLedgerEntryEntity>) =>
            ({ ...data }) as CoinLedgerEntryEntity,
          save: async (row: CoinLedgerEntryEntity) => {
            const saved = {
              ...row,
              id: row.id ?? `ledger-${store.ledgers.length + 1}`,
              createdAt: row.createdAt ?? new Date(),
            };
            store.ledgers.push(saved);
            return saved;
          },
        };
      }
      if (entity === UserEntity) {
        return { findOne: async () => null };
      }
      if (entity === MatchingPolicyEntity) {
        return {
          findOne: async () => {
            const active = [...store.matchingPolicies.values()].find(
              (row) => row.isActive,
            );
            return active ? { ...active } : null;
          },
          find: async () =>
            [...store.matchingPolicies.values()].map((row) => ({ ...row })),
          save: async (row: MatchingPolicyEntity) => {
            store.matchingPolicies.set(row.id, { ...row });
            return { ...row };
          },
        };
      }
      if (entity === AuditLogEntity) {
        return {
          create: (data: Partial<AuditLogEntity>) => ({ ...data }) as AuditLogEntity,
          save: async (row: AuditLogEntity) => ({ ...row }),
        };
      }
      throw new Error(`Unexpected entity ${String(entity)}`);
    },
    query: async (sql: string, params: unknown[]) => {
      const status = params[0] as TradeStatus;
      const now = new Date();
      if (status === TradeStatus.WAITING_BUYER_PAYMENT) {
        const found = [...store.trades.values()].find(
          (trade) =>
            trade.status === status && trade.buyerPaymentDueAt <= now,
        );
        return found ? [{ id: found.id }] : [];
      }
      if (status === TradeStatus.WAITING_SELLER_CONFIRMATION) {
        const found = [...store.trades.values()].find(
          (trade) =>
            trade.status === status &&
            trade.sellerConfirmationDueAt !== null &&
            trade.sellerConfirmationDueAt <= now,
        );
        return found ? [{ id: found.id }] : [];
      }
      if (status === TradeStatus.COIN_TRANSFERRING) {
        const found = [...store.trades.values()].find(
          (trade) =>
            trade.status === status &&
            trade.coinTransferStartedAt !== null &&
            trade.coinTransferStartedAt.getTime() <= now.getTime() - 2000,
        );
        return found ? [{ id: found.id }] : [];
      }
      return [];
    },
  } as unknown as EntityManager;
}

describe('P0-6 TradeService', () => {
  let store: Store;
  let service: TradeService;
  let coinService: CoinService;

  beforeEach(async () => {
    store = createStore();
    seedMatchedTrade(store);

    const manager = () => makeManager(store);
    const dataSource = {
      transaction: async (fn: (em: EntityManager) => Promise<unknown>) =>
        fn(manager()),
      getRepository: (entity: unknown) => manager().getRepository(entity),
    };

    const tradeRepo = {
      findOne: async ({ where }: { where: { id: string } }) => {
        const found = store.trades.get(where.id);
        return found ? { ...found } : null;
      },
      findAndCount: async () => [
        [...store.trades.values()].map((row) => ({ ...row })),
        store.trades.size,
      ],
    };
    const eventRepo = {
      find: async ({ where }: { where: { tradeId: string } }) =>
        store.events
          .filter((event) => event.tradeId === where.tradeId)
          .map((event) => ({ ...event })),
    };
    const tradeLotRepo = {
      find: async ({ where }: { where: { tradeId: string } }) =>
        [...store.tradeLots.values()]
          .filter((lot) => lot.tradeId === where.tradeId)
          .map((lot) => ({ ...lot })),
    };
    const disputeRepo = {
      findOne: async ({ where }: { where: { tradeId: string } }) => {
        const found = [...store.disputes.values()].find(
          (row) => row.tradeId === where.tradeId,
        );
        return found ? { ...found } : null;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradeService,
        CoinService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: NotificationService,
          useValue: {
            enqueueTradePushInTransaction: jest.fn(async () => undefined),
          },
        },
        {
          provide: UserService,
          useValue: {
            getNicknameByUserId: jest.fn(async (userId: string) =>
              userId === BUYER_ID ? '이구매' : '김민성',
            ),
            getAdminPartySummaries: jest.fn(async (userIds: string[]) => {
              const map = new Map();
              for (const userId of userIds) {
                map.set(userId, {
                  userId,
                  loginId: userId === BUYER_ID ? 'buyer01' : 'seller01',
                  name: userId === BUYER_ID ? '홍길동' : '김판매',
                });
              }
              return map;
            }),
            toAdminPartyDto: jest.fn((summary) => ({
              userId: summary?.userId ?? '',
              loginId: summary?.loginId ?? '',
              name: summary?.name ?? '',
            })),
          },
        },
        {
          provide: BanksService,
          useValue: {
            findByCode: jest.fn(async () => ({ name: '신한은행' })),
          },
        },
        { provide: getRepositoryToken(TradeEntity), useValue: tradeRepo },
        { provide: getRepositoryToken(TradeEventEntity), useValue: eventRepo },
        {
          provide: getRepositoryToken(TradeCoinLotEntity),
          useValue: tradeLotRepo,
        },
        {
          provide: getRepositoryToken(TradeDisputeEntity),
          useValue: disputeRepo,
        },
        {
          provide: getRepositoryToken(MatchingPolicyEntity),
          useValue: {
            findOne: async () => ({
              id: 'policy-1',
              maxRematchCount: 3,
              isActive: true,
            }),
          },
        },
        {
          provide: getRepositoryToken(UserCoinWalletEntity),
          useValue: {},
        },
        { provide: getRepositoryToken(UserCoinLotEntity), useValue: {} },
        { provide: getRepositoryToken(CoinLedgerEntryEntity), useValue: {} },
        { provide: getRepositoryToken(CoinPurchaseEntity), useValue: {} },
        { provide: getRepositoryToken(UserEntity), useValue: {} },
      ],
    }).compile();

    service = module.get(TradeService);
    coinService = module.get(CoinService);
  });

  it('정상: report → confirm → COMPLETED 및 잔액 이전', async () => {
    const reported = await service.reportPayment(BUYER_ID, TRADE_ID);
    expect(reported.status).toBe(TradeStatus.WAITING_SELLER_CONFIRMATION);
    expect(reported.alreadyReported).toBe(false);
    expect(reported.payment?.bankName).toBe('신한은행');
    expect(reported.actions.canConfirmPayment).toBe(false);

    const confirmed = await service.confirmPayment(SELLER_ID, TRADE_ID);
    expect(confirmed.status).toBe(TradeStatus.COMPLETED);

    expect(store.wallets.get(SELLER_ID)?.lockedSellableBalance).toBe('300000');
    expect(store.wallets.get(BUYER_ID)?.sellableBalance).toBe('200000');
    expect(store.buyOrders.get(BUY_ORDER_ID)?.status).toBe(
      BuyOrderStatus.COMPLETED,
    );
    expect(store.sellOrders.get(SELL_ORDER_ID)?.completedCoinAmount).toBe(
      '200000',
    );
    expect(store.sellOrders.get(SELL_ORDER_ID)?.reservedCoinAmount).toBe('0');

    const outs = store.ledgers.filter(
      (row) => row.entryType === CoinLedgerEntryType.P2P_TRANSFER_OUT,
    );
    const ins = store.ledgers.filter(
      (row) => row.entryType === CoinLedgerEntryType.P2P_TRANSFER_IN,
    );
    expect(outs).toHaveLength(1);
    expect(ins).toHaveLength(1);
    expect(outs[0]?.transactionId).toBe(ins[0]?.transactionId);
    expect(outs[0]?.transactionId).toBe(TRADE_ID);

    const buyerLot = [...store.lots.values()].find(
      (lot) => lot.userId === BUYER_ID,
    );
    expect(buyerLot?.sourceType).toBe(CoinSourceType.P2P_PURCHASE);
    expect(buyerLot?.isSellable).toBe(true);
  });

  it('구매자 Timeout → PAYMENT_TIMEOUT, reserved 유지', async () => {
    const trade = store.trades.get(TRADE_ID)!;
    trade.buyerPaymentDueAt = new Date(Date.now() - 1000);
    store.trades.set(TRADE_ID, trade);

    await service.expireDueBuyerPayments(10);
    expect(store.trades.get(TRADE_ID)?.status).toBe(TradeStatus.PAYMENT_TIMEOUT);
    expect(store.sellOrders.get(SELL_ORDER_ID)?.reservedCoinAmount).toBe(
      '200000',
    );
  });

  it('late report: PAYMENT_TIMEOUT → WAITING_SELLER_CONFIRMATION', async () => {
    store.trades.get(TRADE_ID)!.status = TradeStatus.PAYMENT_TIMEOUT;
    const result = await service.reportPayment(BUYER_ID, TRADE_ID);
    expect(result.status).toBe(TradeStatus.WAITING_SELLER_CONFIRMATION);
    expect(
      store.events.some(
        (event) =>
          event.eventCode === TradeEventCode.BUYER_REPORTED_PAYMENT &&
          event.metadata &&
          event.metadata['late'] === true,
      ),
    ).toBe(true);
  });

  it('mark-unpaid → CANCELLED + remaining 복구', async () => {
    store.trades.get(TRADE_ID)!.status = TradeStatus.PAYMENT_TIMEOUT;
    await service.markUnpaid(SELLER_ID, TRADE_ID);
    expect(store.trades.get(TRADE_ID)?.status).toBe(TradeStatus.CANCELLED);
    expect(store.sellOrders.get(SELL_ORDER_ID)?.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get(SELL_ORDER_ID)?.reservedCoinAmount).toBe('0');
    expect(store.buyOrders.get(BUY_ORDER_ID)?.status).toBe(
      BuyOrderStatus.CANCELLED,
    );
  });

  it('판매자 timeout → DISPUTED + dispute 1건, locked 유지', async () => {
    const trade = store.trades.get(TRADE_ID)!;
    trade.status = TradeStatus.WAITING_SELLER_CONFIRMATION;
    trade.sellerConfirmationDueAt = new Date(Date.now() - 1000);
    store.trades.set(TRADE_ID, trade);

    await service.expireDueSellerConfirmations(10);
    expect(store.trades.get(TRADE_ID)?.status).toBe(TradeStatus.DISPUTED);
    expect(store.disputes.size).toBe(1);
    expect([...store.disputes.values()][0]?.reasonCode).toBe(
      'SELLER_CONFIRMATION_TIMEOUT',
    );
    expect(store.wallets.get(SELLER_ID)?.lockedSellableBalance).toBe('500000');
  });

  it('payment report 10회 → 상태 전이 1회', async () => {
    await service.reportPayment(BUYER_ID, TRADE_ID);
    for (let i = 0; i < 9; i += 1) {
      const result = await service.reportPayment(BUYER_ID, TRADE_ID);
      expect(result.alreadyReported).toBe(true);
      expect(result.status).toBe(TradeStatus.WAITING_SELLER_CONFIRMATION);
    }
    const reports = store.events.filter(
      (event) => event.eventCode === TradeEventCode.BUYER_REPORTED_PAYMENT,
    );
    expect(reports).toHaveLength(1);
  });

  it('confirm 10회 → Coin 이전 1회', async () => {
    await service.reportPayment(BUYER_ID, TRADE_ID);
    await service.confirmPayment(SELLER_ID, TRADE_ID);
    for (let i = 0; i < 9; i += 1) {
      const result = await service.confirmPayment(SELLER_ID, TRADE_ID);
      expect(result.alreadyConfirmed).toBe(true);
      expect(result.status).toBe(TradeStatus.COMPLETED);
    }
    expect(
      store.ledgers.filter(
        (row) => row.entryType === CoinLedgerEntryType.P2P_TRANSFER_IN,
      ),
    ).toHaveLength(1);
    expect(store.wallets.get(BUYER_ID)?.sellableBalance).toBe('200000');
  });

  it('transfer 중 예외 시 TX B 롤백, COIN_TRANSFERRING 유지 후 재시도 성공', async () => {
    await service.reportPayment(BUYER_ID, TRADE_ID);
    const consume = jest
      .spyOn(coinService, 'consumeLockedSellableInTransaction')
      .mockRejectedValueOnce(new Error('crash'));

    const first = await service.confirmPayment(SELLER_ID, TRADE_ID);
    expect(first.status).toBe(TradeStatus.COIN_TRANSFERRING);
    expect(store.wallets.get(BUYER_ID)?.sellableBalance).toBe('0');
    expect(store.ledgers).toHaveLength(0);

    consume.mockRestore();
    await service.transferTradeCoin(TRADE_ID);
    expect(store.trades.get(TRADE_ID)?.status).toBe(TradeStatus.COMPLETED);
    expect(store.wallets.get(BUYER_ID)?.sellableBalance).toBe('200000');
  });

  it('입금 후 cancel은 409', async () => {
    await service.reportPayment(BUYER_ID, TRADE_ID);
    await expect(
      service.cancelTrade(BUYER_ID, TRADE_ID, '그만둘래요'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('쌍방취소 4단계 후 reserved 복구', async () => {
    await service.reportPayment(BUYER_ID, TRADE_ID);
    await service.requestCancellation(BUYER_ID, TRADE_ID, '합의 취소');
    await service.agreeCancellation(SELLER_ID, TRADE_ID);
    await service.reportRefund(SELLER_ID, TRADE_ID);
    const done = await service.confirmRefund(BUYER_ID, TRADE_ID);
    expect(done.status).toBe(TradeStatus.CANCELLED);
    expect(store.sellOrders.get(SELL_ORDER_ID)?.remainingCoinAmount).toBe(
      '500000',
    );
    expect(store.sellOrders.get(SELL_ORDER_ID)?.reservedCoinAmount).toBe('0');
  });

  it('COMPLETED 거래 취소 거부', async () => {
    await service.reportPayment(BUYER_ID, TRADE_ID);
    await service.confirmPayment(SELLER_ID, TRADE_ID);
    await expect(
      service.requestCancellation(BUYER_ID, TRADE_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('SellOrder 이미 CANCELLED인 Trade 취소 → wallet unlock', async () => {
    const sell = store.sellOrders.get(SELL_ORDER_ID)!;
    sell.status = SellOrderStatus.CANCELLED;
    sell.remainingCoinAmount = '0';
    sell.cancelledAt = new Date();
    store.sellOrders.set(SELL_ORDER_ID, sell);

    await service.cancelTrade(BUYER_ID, TRADE_ID, '구매자 취소');
    expect(store.trades.get(TRADE_ID)?.status).toBe(TradeStatus.CANCELLED);
    expect(store.wallets.get(SELLER_ID)?.sellableBalance).toBe('200000');
    expect(store.wallets.get(SELLER_ID)?.lockedSellableBalance).toBe('300000');
    expect(store.sellLots[0]?.releasedAmount).toBe('200000');
  });

  it('판매자는 입금 선언할 수 없다', async () => {
    await expect(
      service.reportPayment(SELLER_ID, TRADE_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admin confirm-late-payment → WAITING_SELLER_CONFIRMATION', async () => {
    store.trades.get(TRADE_ID)!.status = TradeStatus.PAYMENT_TIMEOUT;
    const result = await service.confirmLatePayment('admin-1', TRADE_ID, {
      reason: '입금 확인',
    });
    expect(result.status).toBe(TradeStatus.WAITING_SELLER_CONFIRMATION);
    expect(
      store.events.some(
        (event) =>
          event.eventCode === TradeEventCode.ADMIN_CONFIRMED_LATE_PAYMENT,
      ),
    ).toBe(true);
  });

  it('admin confirm-non-payment rematchCount < max → BuyOrder MATCHING', async () => {
    store.trades.get(TRADE_ID)!.status = TradeStatus.PAYMENT_TIMEOUT;
    await service.confirmNonPayment('admin-1', TRADE_ID, {
      reason: '미입금',
    });
    expect(store.trades.get(TRADE_ID)?.status).toBe(TradeStatus.CANCELLED);
    expect(store.buyOrders.get(BUY_ORDER_ID)?.status).toBe(
      BuyOrderStatus.MATCHING,
    );
  });

  it('admin confirm-non-payment rematchCount >= max → BuyOrder CANCELLED', async () => {
    store.trades.get(TRADE_ID)!.status = TradeStatus.PAYMENT_TIMEOUT;
    store.buyOrders.get(BUY_ORDER_ID)!.rematchCount = 3;
    await service.confirmNonPayment('admin-1', TRADE_ID, {
      reason: '미입금',
    });
    expect(store.buyOrders.get(BUY_ORDER_ID)?.status).toBe(
      BuyOrderStatus.CANCELLED,
    );
  });

  it('admin open-dispute → DISPUTED + dispute row', async () => {
    const result = await service.openDispute('admin-1', TRADE_ID, {
      reasonCode: 'PAYMENT_CONFIRMATION_REQUIRED',
      reason: '확인 불일치',
    });
    expect(result.status).toBe(TradeStatus.DISPUTED);
    expect(store.disputes.size).toBe(1);
    expect(
      store.events.some(
        (event) => event.eventCode === TradeEventCode.ADMIN_OPENED_DISPUTE,
      ),
    ).toBe(true);
  });

  it('admin open-dispute 중복 → 409', async () => {
    await service.openDispute('admin-1', TRADE_ID, {
      reasonCode: 'PAYMENT_CONFIRMATION_REQUIRED',
      reason: '1차',
    });
    await expect(
      service.openDispute('admin-1', TRADE_ID, {
        reasonCode: 'PAYMENT_CONFIRMATION_REQUIRED',
        reason: '2차',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
