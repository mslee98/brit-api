import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { AdminCoinAdjustmentOperation } from './domain/enums/admin-coin-adjustment-operation.enum';
import { AdminCoinAdjustmentRequestStatus } from './domain/enums/admin-coin-adjustment-request-status.enum';
import { CoinLedgerEntryType } from './domain/enums/coin-ledger-entry-type.enum';
import { CoinLotStatus } from './domain/enums/coin-lot-status.enum';
import { CoinSourceType } from './domain/enums/coin-source-type.enum';
import { CoinWalletStatus } from './domain/enums/coin-wallet-status.enum';
import { AdminCoinAdjustmentRequestEntity } from './infrastructure/entities/admin-coin-adjustment-request.entity';
import { AuditLogEntity } from './infrastructure/entities/audit-log.entity';
import { CoinLedgerEntryEntity } from './infrastructure/entities/coin-ledger-entry.entity';
import { CoinPurchaseEntity } from './infrastructure/entities/coin-purchase.entity';
import { UserCoinLotEntity } from './infrastructure/entities/user-coin-lot.entity';
import { UserCoinWalletEntity } from './infrastructure/entities/user-coin-wallet.entity';
import { CoinService } from './coin.service';
import { CoinBalanceType } from './domain/enums/coin-balance-type.enum';

type Store = {
  users: Map<string, UserEntity>;
  wallets: Map<string, UserCoinWalletEntity>;
  lots: Map<string, UserCoinLotEntity>;
  ledgers: CoinLedgerEntryEntity[];
  purchases: Map<string, CoinPurchaseEntity>;
  audits: AuditLogEntity[];
  adjustments: Map<string, AdminCoinAdjustmentRequestEntity>;
};

function createStore(): Store {
  return {
    users: new Map(),
    wallets: new Map(),
    lots: new Map(),
    ledgers: [],
    purchases: new Map(),
    audits: [],
    adjustments: new Map(),
  };
}

function adjustmentKey(actorUserId: string, idempotencyKey: string): string {
  return `${actorUserId}:${idempotencyKey}`;
}

function makeRepo<T extends { id?: string }>(
  store: Store,
  kind: keyof Store,
): Partial<Repository<T>> {
  return {
    create: (data: Partial<T>) => ({ ...data }) as T,
    save: async (entity: T | T[]) => {
      const items = Array.isArray(entity) ? entity : [entity];
      for (const item of items) {
        if (kind === 'wallets') {
          const wallet = item as unknown as UserCoinWalletEntity;
          store.wallets.set(wallet.userId, { ...wallet });
        } else if (kind === 'lots') {
          const lot = item as unknown as UserCoinLotEntity;
          if (!lot.id) {
            lot.id = `lot-${store.lots.size + 1}`;
          }
          store.lots.set(lot.id, { ...lot });
        } else if (kind === 'ledgers') {
          const entry = item as unknown as CoinLedgerEntryEntity;
          if (!entry.id) {
            entry.id = `ledger-${store.ledgers.length + 1}`;
          }
          if (!entry.createdAt) {
            entry.createdAt = new Date();
          }
          store.ledgers.push({ ...entry });
        } else if (kind === 'purchases') {
          const purchase = item as unknown as CoinPurchaseEntity;
          if (!purchase.id) {
            purchase.id = `purchase-${store.purchases.size + 1}`;
          }
          if (!purchase.createdAt) {
            purchase.createdAt = new Date();
          }
          store.purchases.set(purchase.id, { ...purchase });
        } else if (kind === 'audits') {
          const audit = item as unknown as AuditLogEntity;
          if (!audit.id) {
            audit.id = `audit-${store.audits.length + 1}`;
          }
          store.audits.push({ ...audit });
        } else if (kind === 'adjustments') {
          const row = item as unknown as AdminCoinAdjustmentRequestEntity;
          if (!row.id) {
            row.id = `adj-${store.adjustments.size + 1}`;
          }
          const now = new Date();
          if (!row.createdAt) {
            row.createdAt = now;
          }
          row.updatedAt = now;
          store.adjustments.set(
            adjustmentKey(row.actorUserId, row.idempotencyKey),
            { ...row },
          );
        }
      }
      return (Array.isArray(entity) ? items : items[0]) as T & T[];
    },
    findOne: async (options: {
      where?: Record<string, unknown>;
      lock?: unknown;
    }) => {
      const where = options.where ?? {};
      if (kind === 'wallets') {
        const userId = where.userId as string;
        const wallet = store.wallets.get(userId);
        return wallet ? ({ ...wallet } as T) : null;
      }
      if (kind === 'purchases') {
        const id = where.id as string;
        const purchase = store.purchases.get(id);
        return purchase ? ({ ...purchase } as T) : null;
      }
      if (kind === 'lots') {
        const id = where.id as string;
        const userId = where.userId as string | undefined;
        const lot = store.lots.get(id);
        if (!lot) {
          return null;
        }
        if (userId && lot.userId !== userId) {
          return null;
        }
        return { ...lot } as T;
      }
      if (kind === 'adjustments') {
        const actorUserId = where.actorUserId as string;
        const idempotencyKey = where.idempotencyKey as string;
        const row = store.adjustments.get(
          adjustmentKey(actorUserId, idempotencyKey),
        );
        return row ? ({ ...row } as T) : null;
      }
      return null;
    },
    findOneOrFail: async (options: { where?: Record<string, unknown> }) => {
      const found = await (makeRepo(store, kind).findOne as Function)(options);
      if (!found) {
        throw new Error('not found');
      }
      return found;
    },
    find: async (options: {
      where?: Record<string, unknown>;
      order?: unknown;
      lock?: unknown;
    }) => {
      if (kind !== 'lots') {
        return [];
      }
      const where = options.where ?? {};
      const userId = where.userId as string;
      const isSellable = where.isSellable as boolean;
      return [...store.lots.values()]
        .filter((lot) => lot.userId === userId && lot.isSellable === isSellable)
        .filter((lot) =>
          [CoinLotStatus.AVAILABLE, CoinLotStatus.PARTIALLY_USED].includes(
            lot.status,
          ),
        )
        .sort((a, b) => {
          const t = a.availableAt.getTime() - b.availableAt.getTime();
          return t !== 0 ? t : a.id.localeCompare(b.id);
        })
        .map((lot) => ({ ...lot }));
    },
    findAndCount: async () => [[], 0],
    createQueryBuilder: () => ({
      where: () => ({
        orderBy: () => ({
          addOrderBy: () => ({
            andWhere: function andWhere() {
              return this;
            },
            skip: () => ({
              take: () => ({
                getManyAndCount: async () => [store.ledgers, store.ledgers.length],
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

function makeManager(store: Store): EntityManager {
  return {
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) {
        return {
          findOne: async ({ where }: { where: { id: string } }) => {
            const user = store.users.get(where.id);
            return user ? { ...user } : null;
          },
        };
      }
      if (entity === UserCoinWalletEntity) {
        return makeRepo(store, 'wallets');
      }
      if (entity === UserCoinLotEntity) {
        return makeRepo(store, 'lots');
      }
      if (entity === CoinLedgerEntryEntity) {
        return makeRepo(store, 'ledgers');
      }
      if (entity === CoinPurchaseEntity) {
        return makeRepo(store, 'purchases');
      }
      if (entity === AuditLogEntity) {
        return makeRepo(store, 'audits');
      }
      if (entity === AdminCoinAdjustmentRequestEntity) {
        return makeRepo(store, 'adjustments');
      }
      throw new Error(`Unexpected entity ${String(entity)}`);
    },
  } as unknown as EntityManager;
}

describe('CoinService P0 acceptance', () => {
  const userId = 'user-001';
  const adminId = 'admin-001';
  let store: Store;
  let service: CoinService;
  let walletRepo: ReturnType<typeof makeRepo>;
  let purchaseRepo: ReturnType<typeof makeRepo>;
  let userRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    store = createStore();
    store.users.set(userId, {
      id: userId,
      status: UserStatus.ACTIVE,
    } as UserEntity);
    store.wallets.set(userId, {
      userId,
      nonSellableBalance: '0',
      sellableBalance: '0',
      lockedNonSellableBalance: '0',
      lockedSellableBalance: '0',
      pendingSellableBalance: '0',
      status: CoinWalletStatus.ACTIVE,
      version: 0,
    } as UserCoinWalletEntity);

    walletRepo = makeRepo(store, 'wallets');
    purchaseRepo = makeRepo(store, 'purchases');
    userRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
        const user = store.users.get(where.id);
        return user ? { ...user } : null;
      }),
    };

    const dataSource = {
      transaction: async (fn: (manager: EntityManager) => Promise<unknown>) =>
        fn(makeManager(store)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoinService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(UserCoinWalletEntity), useValue: walletRepo },
        {
          provide: getRepositoryToken(UserCoinLotEntity),
          useValue: makeRepo(store, 'lots'),
        },
        {
          provide: getRepositoryToken(CoinLedgerEntryEntity),
          useValue: makeRepo(store, 'ledgers'),
        },
        {
          provide: getRepositoryToken(CoinPurchaseEntity),
          useValue: purchaseRepo,
        },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();

    service = module.get(CoinService);
  });

  it('①② wallet starts at zero', async () => {
    const wallet = await service.getWallet(userId);
    expect(wallet.totalBalance).toBe('0');
    expect(wallet.nonSellableBalance).toBe('0');
  });

  it('③ complete purchase credits non_sellable + lot + ledger', async () => {
    const purchase = await service.createCoinPurchase(adminId, userId, '100000');
    const wallet = await service.completeCoinPurchase(purchase.id, adminId);

    expect(wallet.nonSellableBalance).toBe('100000');
    expect(wallet.totalBalance).toBe('100000');
    expect([...store.lots.values()]).toHaveLength(1);
    expect([...store.lots.values()][0]?.sourceType).toBe(
      CoinSourceType.BRIT_PURCHASE,
    );
    expect(store.ledgers).toHaveLength(1);
    expect(store.ledgers[0]?.nonSellableDelta).toBe('100000');
  });

  it('④ duplicate complete is rejected and does not double credit', async () => {
    const purchase = await service.createCoinPurchase(adminId, userId, '100000');
    await service.completeCoinPurchase(purchase.id, adminId);

    await expect(
      service.completeCoinPurchase(purchase.id, adminId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.wallets.get(userId)?.nonSellableBalance).toBe('100000');
    expect(store.ledgers).toHaveLength(1);
  });

  it('⑤ admin credit adds wallet/lot/ledger/audit', async () => {
    const purchase = await service.createCoinPurchase(adminId, userId, '100000');
    await service.completeCoinPurchase(purchase.id, adminId);

    const wallet = await service.adminCredit(
      adminId,
      UserRole.ADMIN,
      userId,
      { amount: '20000', sellable: false, reason: '보정' },
      null,
      randomUUID(),
    );

    expect(wallet.nonSellableBalance).toBe('120000');
    expect(store.lots.size).toBe(2);
    expect(store.ledgers.length).toBe(2);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]?.actionType).toBe('ADMIN_COIN_CREDIT');
    expect(store.audits[0]?.targetType).toBe(AuditTargetType.USER);
    const afterData = store.audits[0]?.afterData as Record<string, unknown>;
    expect(afterData.transactionId).toEqual(expect.any(String));
    expect(afterData.amount).toBe('20000');
    expect(afterData.balanceType).toBe(CoinBalanceType.NON_SELLABLE);
    expect(afterData.wallet).toMatchObject({
      nonSellableBalance: '120000',
    });
  });

  it('⑤-b ADMIN cannot credit sellable', async () => {
    await expect(
      service.adminCredit(
        adminId,
        UserRole.ADMIN,
        userId,
        { amount: '1000', sellable: true, reason: '불가' },
        null,
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('⑥ admin debit consumes lot FIFO and writes ledger/audit', async () => {
    const purchase = await service.createCoinPurchase(adminId, userId, '100000');
    await service.completeCoinPurchase(purchase.id, adminId);
    await service.adminCredit(
      adminId,
      UserRole.ADMIN,
      userId,
      { amount: '20000', sellable: false, reason: '보정' },
      null,
      randomUUID(),
    );

    const wallet = await service.adminDebit(
      adminId,
      userId,
      {
        amount: '10000',
        balanceType: CoinBalanceType.NON_SELLABLE,
        reason: '중복 지급 보정',
      },
      null,
      randomUUID(),
    );

    expect(wallet.nonSellableBalance).toBe('110000');
    const firstLot = [...store.lots.values()].find(
      (lot) => lot.sourceType === CoinSourceType.BRIT_PURCHASE,
    );
    expect(firstLot?.consumedAmount).toBe('10000');
    expect(firstLot?.remainingAmount).toBe('90000');
    expect(firstLot?.status).toBe(CoinLotStatus.PARTIALLY_USED);
    expect(store.audits.some((a) => a.actionType === 'ADMIN_COIN_DEBIT')).toBe(
      true,
    );
    const debitAudit = store.audits.find(
      (a) => a.actionType === 'ADMIN_COIN_DEBIT',
    );
    const debitAfterData = debitAudit?.afterData as Record<string, unknown>;
    expect(debitAfterData.transactionId).toEqual(expect.any(String));
    expect(debitAfterData.amount).toBe('10000');
    expect(debitAfterData.deduction).toEqual({
      nonSellableAmount: '10000',
      sellableAmount: '0',
    });
  });

  it('⑦ over-debit fails and rolls back (no partial persist via thrown error)', async () => {
    const purchase = await service.createCoinPurchase(adminId, userId, '100000');
    await service.completeCoinPurchase(purchase.id, adminId);
    const beforeLedgerCount = store.ledgers.length;
    const beforeBalance = store.wallets.get(userId)?.nonSellableBalance;

    // In-memory mock does not auto-rollback; simulate by catching and verifying
    // service throws before completing wallet save when lots cannot cover.
    // Force empty remaining on lots to trigger mid-check after wallet available check:
    // First ensure balance check fails when requesting more than wallet.
    await expect(
      service.adminDebit(
        adminId,
        userId,
        {
          amount: '999999',
          balanceType: CoinBalanceType.NON_SELLABLE,
          reason: '초과',
        },
        null,
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.wallets.get(userId)?.nonSellableBalance).toBe(beforeBalance);
    expect(store.ledgers.length).toBe(beforeLedgerCount);
  });

  it('createEmptyWalletInTransaction inserts zero wallet', async () => {
    const newUserId = 'user-002';
    await service.createEmptyWalletInTransaction(makeManager(store), newUserId);
    const wallet = store.wallets.get(newUserId);
    expect(wallet?.nonSellableBalance).toBe('0');
    expect(wallet?.status).toBe(CoinWalletStatus.ACTIVE);
  });

  it('lockSellable moves sellable→locked and keeps lot PARTIALLY_USED when remaining=0', async () => {
    await service.adminCredit(
      adminId,
      UserRole.SYS_ADMIN,
      userId,
      { amount: '500000', sellable: true, reason: '테스트 지급' },
      null,
      randomUUID(),
    );

    const manager = makeManager(store);
    const allocations = await service.lockSellableInTransaction(manager, {
      userId,
      amount: '500000',
      referenceType: 'SELL_ORDER',
      referenceId: 'sell-001',
    });

    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.lockedAmount).toBe('500000');
    const wallet = store.wallets.get(userId);
    expect(wallet?.sellableBalance).toBe('0');
    expect(wallet?.lockedSellableBalance).toBe('500000');
    const lot = [...store.lots.values()][0];
    expect(lot?.remainingAmount).toBe('0');
    expect(lot?.lockedAmount).toBe('500000');
    expect(lot?.status).toBe(CoinLotStatus.PARTIALLY_USED);
    expect(
      store.ledgers.some(
        (e) => e.entryType === CoinLedgerEntryType.SELL_ORDER_LOCKED,
      ),
    ).toBe(true);
  });

  it('lockSellable fails when sellable insufficient', async () => {
    await service.adminCredit(
      adminId,
      UserRole.SYS_ADMIN,
      userId,
      { amount: '100000', sellable: true, reason: '소량' },
      null,
      randomUUID(),
    );
    const before = { ...store.wallets.get(userId)! };
    const beforeLots = store.lots.size;
    const beforeLedgers = store.ledgers.length;

    await expect(
      service.lockSellableInTransaction(makeManager(store), {
        userId,
        amount: '200000',
        referenceType: 'SELL_ORDER',
        referenceId: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(store.wallets.get(userId)?.sellableBalance).toBe(
      before.sellableBalance,
    );
    expect(store.lots.size).toBe(beforeLots);
    expect(store.ledgers.length).toBe(beforeLedgers);
  });

  it('releaseSellable restores locked→sellable', async () => {
    await service.adminCredit(
      adminId,
      UserRole.SYS_ADMIN,
      userId,
      { amount: '300000', sellable: true, reason: '지급' },
      null,
      randomUUID(),
    );
    const manager = makeManager(store);
    const allocations = await service.lockSellableInTransaction(manager, {
      userId,
      amount: '300000',
      referenceType: 'SELL_ORDER',
      referenceId: 'sell-002',
    });

    await service.releaseSellableInTransaction(manager, {
      userId,
      amount: '300000',
      allocations: allocations.map((a) => ({
        coinLotId: a.coinLotId,
        availableToRelease: a.lockedAmount,
      })),
      referenceType: 'SELL_ORDER',
      referenceId: 'sell-002',
    });

    const wallet = store.wallets.get(userId);
    expect(wallet?.sellableBalance).toBe('300000');
    expect(wallet?.lockedSellableBalance).toBe('0');
    expect(
      store.ledgers.some(
        (e) => e.entryType === CoinLedgerEntryType.SELL_ORDER_RELEASED,
      ),
    ).toBe(true);
  });

  it('consumeLockedSellable decreases locked only and writes one ledger', async () => {
    await service.adminCredit(
      adminId,
      UserRole.SYS_ADMIN,
      userId,
      { amount: '200000', sellable: true, reason: 'lock 대상' },
      null,
      randomUUID(),
    );
    const manager = makeManager(store);
    const allocations = await service.lockSellableInTransaction(manager, {
      userId,
      amount: '200000',
      referenceType: 'SELL_ORDER',
      referenceId: 'sell-003',
    });

    await service.consumeLockedSellableInTransaction(manager, {
      userId,
      allocations: allocations.map((row) => ({
        coinLotId: row.coinLotId,
        amount: row.lockedAmount,
      })),
      entryType: CoinLedgerEntryType.P2P_TRANSFER_OUT,
      referenceType: 'TRADE',
      referenceId: 'trade-001',
      transactionId: 'trade-001',
      sequenceNo: 1,
    });

    const wallet = store.wallets.get(userId);
    expect(wallet?.sellableBalance).toBe('0');
    expect(wallet?.lockedSellableBalance).toBe('0');
    const lot = [...store.lots.values()][0];
    expect(lot?.lockedAmount).toBe('0');
    expect(lot?.consumedAmount).toBe('200000');
    expect(lot?.status).toBe(CoinLotStatus.FULLY_CONSUMED);
    const out = store.ledgers.find(
      (entry) => entry.entryType === CoinLedgerEntryType.P2P_TRANSFER_OUT,
    );
    expect(out?.transactionId).toBe('trade-001');
    expect(out?.lockedSellableDelta).toBe('-200000');
    expect(out?.sellableDelta).toBe('0');
  });

  it('admin credit same Idempotency-Key replays without double credit', async () => {
    const key = randomUUID();
    const body = { amount: '15000', sellable: false, reason: '멱등 지급' };

    const first = await service.adminCredit(
      adminId,
      UserRole.ADMIN,
      userId,
      body,
      null,
      key,
    );
    const ledgerCount = store.ledgers.length;
    const lotCount = store.lots.size;

    const second = await service.adminCredit(
      adminId,
      UserRole.ADMIN,
      userId,
      body,
      null,
      key,
    );

    expect(second).toEqual(first);
    expect(store.wallets.get(userId)?.nonSellableBalance).toBe('15000');
    expect(store.ledgers.length).toBe(ledgerCount);
    expect(store.lots.size).toBe(lotCount);
  });

  it('admin credit same Key different amount conflicts', async () => {
    const key = randomUUID();
    await service.adminCredit(
      adminId,
      UserRole.ADMIN,
      userId,
      { amount: '10000', sellable: false, reason: '원본' },
      null,
      key,
    );

    await expect(
      service.adminCredit(
        adminId,
        UserRole.ADMIN,
        userId,
        { amount: '20000', sellable: false, reason: '원본' },
        null,
        key,
      ),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_CONFLICT' },
    });
    expect(store.wallets.get(userId)?.nonSellableBalance).toBe('10000');
  });

  it('admin credit in-progress same Key returns REQUEST_IN_PROGRESS', async () => {
    const key = randomUUID();
    store.adjustments.set(adjustmentKey(adminId, key), {
      id: 'adj-progress',
      idempotencyKey: key,
      actorUserId: adminId,
      targetUserId: userId,
      operation: AdminCoinAdjustmentOperation.CREDIT,
      requestHash: 'pending-hash',
      status: AdminCoinAdjustmentRequestStatus.IN_PROGRESS,
      responseBody: null,
      ledgerTransactionId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AdminCoinAdjustmentRequestEntity);

    await expect(
      service.adminCredit(
        adminId,
        UserRole.ADMIN,
        userId,
        { amount: '1000', sellable: false, reason: '진행중' },
        null,
        key,
      ),
    ).rejects.toMatchObject({
      response: { code: 'REQUEST_IN_PROGRESS' },
    });
  });

  it('admin debit same Idempotency-Key is idempotent', async () => {
    await service.adminCredit(
      adminId,
      UserRole.ADMIN,
      userId,
      { amount: '50000', sellable: false, reason: '준비' },
      null,
      randomUUID(),
    );
    const key = randomUUID();
    const body = {
      amount: '10000',
      balanceType: CoinBalanceType.NON_SELLABLE,
      reason: '멱등 차감',
    };

    const first = await service.adminDebit(adminId, userId, body, null, key);
    const ledgerCount = store.ledgers.length;

    const second = await service.adminDebit(adminId, userId, body, null, key);

    expect(second).toEqual(first);
    expect(store.wallets.get(userId)?.nonSellableBalance).toBe('40000');
    expect(store.ledgers.length).toBe(ledgerCount);
  });
});
