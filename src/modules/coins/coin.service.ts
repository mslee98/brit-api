import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { AuditActionType } from './domain/enums/audit-action-type.enum';
import { AdminCoinAdjustmentOperation } from './domain/enums/admin-coin-adjustment-operation.enum';
import { AdminCoinAdjustmentRequestStatus } from './domain/enums/admin-coin-adjustment-request-status.enum';
import { CoinBalanceType } from './domain/enums/coin-balance-type.enum';
import { CoinHistoryTypeFilter } from './domain/enums/coin-history-type-filter.enum';
import { CoinLedgerEntryType } from './domain/enums/coin-ledger-entry-type.enum';
import { CoinLotStatus } from './domain/enums/coin-lot-status.enum';
import { CoinPurchaseStatus } from './domain/enums/coin-purchase-status.enum';
import { CoinSourceType } from './domain/enums/coin-source-type.enum';
import { CoinWalletStatus } from './domain/enums/coin-wallet-status.enum';
import {
  AdminCreditCoinDto,
  AdminDebitCoinDto,
} from './dto/admin-coin-command.dto';
import {
  CoinHistoryItemDto,
  CoinLotItemDto,
  CoinPurchaseResponseDto,
  CoinWalletResponseDto,
} from './dto/coin-response.dto';
import { SearchCoinHistoryDto, SearchCoinLotsDto } from './dto/search-coin.dto';
import { CoinDomainException } from './exceptions/coin.exceptions';
import { AdminCoinAdjustmentRequestEntity } from './infrastructure/entities/admin-coin-adjustment-request.entity';
import { AuditLogEntity } from './infrastructure/entities/audit-log.entity';
import { CoinLedgerEntryEntity } from './infrastructure/entities/coin-ledger-entry.entity';
import { CoinPurchaseEntity } from './infrastructure/entities/coin-purchase.entity';
import { UserCoinLotEntity } from './infrastructure/entities/user-coin-lot.entity';
import { UserCoinWalletEntity } from './infrastructure/entities/user-coin-wallet.entity';
import {
  ADMIN_COIN_ADJUSTMENT_IN_PROGRESS_STALE_MS,
  hashAdminCoinAdjustmentRequest,
  isUuid,
} from './utils/admin-coin-adjustment-idempotency.util';
import {
  addAmount,
  isPositiveAmountString,
  minAmount,
  subAmount,
} from './utils/coin-amount.util';

const HISTORY_TYPE_MAP: Record<
  Exclude<CoinHistoryTypeFilter, CoinHistoryTypeFilter.ALL>,
  CoinLedgerEntryType[]
> = {
  [CoinHistoryTypeFilter.BRIT_PURCHASE]: [
    CoinLedgerEntryType.BRIT_PURCHASE_CONFIRMED,
  ],
  [CoinHistoryTypeFilter.ADMIN_ADJUSTMENT]: [
    CoinLedgerEntryType.ADMIN_CREDIT,
    CoinLedgerEntryType.ADMIN_DEBIT,
  ],
};

type CreditParams = {
  userId: string;
  amount: string;
  sourceType: CoinSourceType;
  sourceId: string | null;
  entryType: CoinLedgerEntryType;
  referenceType: string;
  referenceId: string | null;
  description: string | null;
  isSellable: boolean;
  transactionId?: string;
  sequenceNo?: number;
};

type DebitParams = {
  userId: string;
  amount: string;
  isSellable: boolean;
  entryType: CoinLedgerEntryType;
  referenceType: string;
  referenceId: string | null;
  description: string | null;
  transactionId?: string;
};

export type CoinLotAllocation = {
  coinLotId: string;
  lockedAmount: string;
};

type LockSellableParams = {
  userId: string;
  amount: string;
  referenceType: string;
  referenceId: string | null;
  description?: string | null;
};

type ReleaseSellableParams = {
  userId: string;
  amount: string;
  /** 해제 대상 Lot 할당 (아직 unlock 가능 잔량 기준) */
  allocations: Array<{
    coinLotId: string;
    availableToRelease: string;
  }>;
  referenceType: string;
  referenceId: string | null;
  description?: string | null;
};

export type ConsumeLockedAllocation = {
  coinLotId: string;
  amount: string;
};

type ConsumeLockedSellableParams = {
  userId: string;
  allocations: ConsumeLockedAllocation[];
  entryType: CoinLedgerEntryType;
  referenceType: string;
  referenceId: string | null;
  description?: string | null;
  transactionId: string;
  sequenceNo: number;
};

/**
 * 사용자 Coin Wallet / Lot / Ledger.
 * Write는 단일 TX + wallet/lots pessimistic_write.
 * UserEntity Repository는 ACTIVE 상태 검사용으로만 주입한다.
 */
@Injectable()
export class CoinService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserCoinWalletEntity)
    private readonly walletRepository: Repository<UserCoinWalletEntity>,
    @InjectRepository(UserCoinLotEntity)
    private readonly lotRepository: Repository<UserCoinLotEntity>,
    @InjectRepository(CoinLedgerEntryEntity)
    private readonly ledgerRepository: Repository<CoinLedgerEntryEntity>,
    @InjectRepository(CoinPurchaseEntity)
    private readonly purchaseRepository: Repository<CoinPurchaseEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /** 가입 TX에서 0잔액 지갑 생성 */
  async createEmptyWalletInTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<UserCoinWalletEntity> {
    const walletRepository = manager.getRepository(UserCoinWalletEntity);
    const wallet = walletRepository.create({
      userId,
      nonSellableBalance: '0',
      sellableBalance: '0',
      lockedNonSellableBalance: '0',
      lockedSellableBalance: '0',
      pendingSellableBalance: '0',
      status: CoinWalletStatus.ACTIVE,
    });
    return walletRepository.save(wallet);
  }

  async findWallet(
    userId: string,
  ): Promise<UserCoinWalletEntity | null> {
    return this.walletRepository.findOne({
      where: { userId },
    });
  }

  async getWallet(userId: string): Promise<CoinWalletResponseDto> {
    const wallet = await this.findWallet(userId);
    if (!wallet) {
      throw CoinDomainException.walletNotFound();
    }
    return CoinWalletResponseDto.from(wallet);
  }

  async getHistory(
    userId: string,
    query: SearchCoinHistoryDto,
  ): Promise<{ items: CoinHistoryItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const qb = this.ledgerRepository
      .createQueryBuilder('ledger')
      .where('ledger.user_id = :userId', { userId })
      .orderBy('ledger.created_at', 'DESC')
      .addOrderBy('ledger.sequence_no', 'DESC');

    if (query.type && query.type !== CoinHistoryTypeFilter.ALL) {
      qb.andWhere('ledger.entry_type IN (:...types)', {
        types: HISTORY_TYPE_MAP[query.type],
      });
    }

    if (query.from) {
      qb.andWhere('ledger.created_at >= :from', {
        from: this.kstDayStartUtc(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('ledger.created_at < :toExclusive', {
        toExclusive: this.kstDayEndExclusiveUtc(query.to),
      });
    }

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      items: rows.map((row) => CoinHistoryItemDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getLots(
    userId: string,
    query: SearchCoinLotsDto,
  ): Promise<{ items: CoinLotItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const [rows, totalItems] = await this.lotRepository.findAndCount({
      where: { userId },
      order: { availableAt: 'ASC', id: 'ASC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => CoinLotItemDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getLotDetail(userId: string, lotId: string): Promise<CoinLotItemDto> {
    const lot = await this.lotRepository.findOne({
      where: { id: lotId, userId },
    });
    if (!lot) {
      throw CoinDomainException.lotNotFound();
    }
    return CoinLotItemDto.from(lot);
  }

  async createCoinPurchase(
    adminUserId: string,
    userId: string,
    amount: string,
  ): Promise<CoinPurchaseResponseDto> {
    this.assertPositiveAmount(amount);
    await this.assertUserActive(userId);

    const purchase = this.purchaseRepository.create({
      userId,
      amount,
      status: CoinPurchaseStatus.PENDING,
      completedAt: null,
      createdByUserId: adminUserId,
      completedByUserId: null,
    });
    const saved = await this.purchaseRepository.save(purchase);
    return this.toPurchaseResponse(saved);
  }

  async completeCoinPurchase(
    purchaseId: string,
    completedByUserId: string | null,
  ): Promise<CoinWalletResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const purchaseRepository = manager.getRepository(CoinPurchaseEntity);
      const purchase = await purchaseRepository.findOne({
        where: { id: purchaseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!purchase) {
        throw CoinDomainException.purchaseNotFound();
      }
      if (purchase.status === CoinPurchaseStatus.COMPLETED) {
        throw CoinDomainException.transactionAlreadyProcessed();
      }
      if (purchase.status !== CoinPurchaseStatus.PENDING) {
        throw CoinDomainException.transactionAlreadyProcessed();
      }

      await this.assertUserActiveInTransaction(manager, purchase.userId);
      await this.creditNonSellable(manager, {
        userId: purchase.userId,
        amount: purchase.amount,
        sourceType: CoinSourceType.BRIT_PURCHASE,
        sourceId: purchase.id,
        entryType: CoinLedgerEntryType.BRIT_PURCHASE_CONFIRMED,
        referenceType: 'COIN_PURCHASE',
        referenceId: purchase.id,
        description: null,
        isSellable: false,
      });

      purchase.status = CoinPurchaseStatus.COMPLETED;
      purchase.completedAt = new Date();
      purchase.completedByUserId = completedByUserId;
      await purchaseRepository.save(purchase);

      const wallet = await manager.getRepository(UserCoinWalletEntity).findOne({
        where: { userId: purchase.userId },
      });
      if (!wallet) {
        throw CoinDomainException.walletNotFound();
      }
      return CoinWalletResponseDto.from(wallet);
    });
  }

  async adminCredit(
    adminUserId: string,
    adminRole: UserRole,
    targetUserId: string,
    dto: AdminCreditCoinDto,
    ipAddress: string | null,
    idempotencyKey: string,
  ): Promise<CoinWalletResponseDto> {
    this.assertPositiveAmount(dto.amount);
    if (dto.sellable && adminRole !== UserRole.SYS_ADMIN) {
      throw CoinDomainException.adminAdjustmentNotAllowed();
    }
    const key = this.assertIdempotencyKey(idempotencyKey);
    const requestHash = hashAdminCoinAdjustmentRequest({
      operation: AdminCoinAdjustmentOperation.CREDIT,
      targetUserId,
      amount: dto.amount,
      sellable: dto.sellable,
      reason: dto.reason,
    });

    return this.dataSource.transaction(async (manager) => {
      const claim = await this.claimAdjustmentRequest(manager, {
        actorUserId: adminUserId,
        targetUserId,
        operation: AdminCoinAdjustmentOperation.CREDIT,
        idempotencyKey: key,
        requestHash,
      });
      if (claim.kind === 'replay') {
        return claim.response;
      }

      await this.assertUserActiveInTransaction(manager, targetUserId);

      const beforeWallet = await this.lockWallet(manager, targetUserId);
      const beforeData = this.pickWalletBalances(beforeWallet);
      const ledgerTransactionId = randomUUID();

      if (dto.sellable) {
        await this.creditSellable(manager, {
          userId: targetUserId,
          amount: dto.amount,
          sourceType: CoinSourceType.ADMIN_ADJUSTMENT,
          sourceId: null,
          entryType: CoinLedgerEntryType.ADMIN_CREDIT,
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: claim.request.id,
          description: dto.reason,
          isSellable: true,
          transactionId: ledgerTransactionId,
        });
      } else {
        await this.creditNonSellable(manager, {
          userId: targetUserId,
          amount: dto.amount,
          sourceType: CoinSourceType.ADMIN_ADJUSTMENT,
          sourceId: null,
          entryType: CoinLedgerEntryType.ADMIN_CREDIT,
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: claim.request.id,
          description: dto.reason,
          isSellable: false,
          transactionId: ledgerTransactionId,
        });
      }

      const after = await manager
        .getRepository(UserCoinWalletEntity)
        .findOneOrFail({
          where: { userId: targetUserId },
        });

      await this.writeAuditLog(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_COIN_CREDIT,
        targetType: AuditTargetType.USER,
        targetId: targetUserId,
        beforeData,
        afterData: {
          transactionId: ledgerTransactionId,
          amount: dto.amount,
          balanceType: dto.sellable
            ? CoinBalanceType.SELLABLE
            : CoinBalanceType.NON_SELLABLE,
          wallet: this.pickWalletBalances(after),
        },
        reason: dto.reason,
        ipAddress,
      });

      const response = CoinWalletResponseDto.from(after);
      await this.completeAdjustmentRequest(manager, claim.request, {
        response,
        ledgerTransactionId,
      });
      return response;
    });
  }

  async adminDebit(
    adminUserId: string,
    targetUserId: string,
    dto: AdminDebitCoinDto,
    ipAddress: string | null,
    idempotencyKey: string,
  ): Promise<CoinWalletResponseDto> {
    this.assertPositiveAmount(dto.amount);
    const key = this.assertIdempotencyKey(idempotencyKey);
    const requestHash = hashAdminCoinAdjustmentRequest({
      operation: AdminCoinAdjustmentOperation.DEBIT,
      targetUserId,
      amount: dto.amount,
      balanceType: dto.balanceType,
      reason: dto.reason,
    });

    return this.dataSource.transaction(async (manager) => {
      const claim = await this.claimAdjustmentRequest(manager, {
        actorUserId: adminUserId,
        targetUserId,
        operation: AdminCoinAdjustmentOperation.DEBIT,
        idempotencyKey: key,
        requestHash,
      });
      if (claim.kind === 'replay') {
        return claim.response;
      }

      await this.assertUserActiveInTransaction(manager, targetUserId);
      const beforeWallet = await this.lockWallet(manager, targetUserId);
      const beforeData = this.pickWalletBalances(beforeWallet);
      const ledgerTransactionId = randomUUID();

      const isSellable = dto.balanceType === CoinBalanceType.SELLABLE;
      await this.debitBalance(manager, {
        userId: targetUserId,
        amount: dto.amount,
        isSellable,
        entryType: CoinLedgerEntryType.ADMIN_DEBIT,
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId: claim.request.id,
        description: dto.reason,
        transactionId: ledgerTransactionId,
      });

      const after = await manager
        .getRepository(UserCoinWalletEntity)
        .findOneOrFail({
          where: { userId: targetUserId },
        });

      await this.writeAuditLog(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_COIN_DEBIT,
        targetType: AuditTargetType.USER,
        targetId: targetUserId,
        beforeData,
        afterData: {
          transactionId: ledgerTransactionId,
          amount: dto.amount,
          deduction: {
            nonSellableAmount:
              dto.balanceType === CoinBalanceType.NON_SELLABLE
                ? dto.amount
                : '0',
            sellableAmount:
              dto.balanceType === CoinBalanceType.SELLABLE ? dto.amount : '0',
          },
          wallet: this.pickWalletBalances(after),
        },
        reason: dto.reason,
        ipAddress,
      });

      const response = CoinWalletResponseDto.from(after);
      await this.completeAdjustmentRequest(manager, claim.request, {
        response,
        ledgerTransactionId,
      });
      return response;
    });
  }

  /** 내부: 판매 불가 Coin 지급 (Brit 구매 등) */
  async creditNonSellable(
    manager: EntityManager,
    params: CreditParams,
  ): Promise<void> {
    await this.credit(manager, { ...params, isSellable: false });
  }

  /** 내부: 판매 가능 Coin 지급 */
  async creditSellable(
    manager: EntityManager,
    params: CreditParams,
  ): Promise<void> {
    await this.credit(manager, { ...params, isSellable: true });
  }

  async debitNonSellable(
    manager: EntityManager,
    params: DebitParams,
  ): Promise<void> {
    await this.debitBalance(manager, { ...params, isSellable: false });
  }

  async debitSellable(
    manager: EntityManager,
    params: DebitParams,
  ): Promise<void> {
    await this.debitBalance(manager, { ...params, isSellable: true });
  }

  /**
   * 판매 가능 Coin을 available → locked로 이동 (판매 주문 생성).
   * FIFO Lot 할당 결과를 반환한다.
   */
  async lockSellableInTransaction(
    manager: EntityManager,
    params: LockSellableParams,
  ): Promise<CoinLotAllocation[]> {
    this.assertPositiveAmount(params.amount);
    const wallet = await this.lockWallet(manager, params.userId);

    if (BigInt(wallet.sellableBalance) < BigInt(params.amount)) {
      throw CoinDomainException.sellableBalanceInsufficient();
    }

    const lotRepository = manager.getRepository(UserCoinLotEntity);
    const lots = await lotRepository.find({
      where: {
        userId: params.userId,
        isSellable: true,
        status: In([CoinLotStatus.AVAILABLE, CoinLotStatus.PARTIALLY_USED]),
      },
      order: { availableAt: 'ASC', id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    let remainingToLock = BigInt(params.amount);
    const transactionId = randomUUID();
    let sequenceNo = 1;
    const allocations: CoinLotAllocation[] = [];

    for (const lot of lots) {
      if (remainingToLock <= 0n) {
        break;
      }
      if (BigInt(lot.remainingAmount) <= 0n) {
        continue;
      }

      const take = minAmount(lot.remainingAmount, remainingToLock.toString());
      lot.remainingAmount = subAmount(lot.remainingAmount, take);
      lot.lockedAmount = addAmount(lot.lockedAmount, take);
      lot.status = this.resolveLotStatus(lot);
      await lotRepository.save(lot);

      allocations.push({ coinLotId: lot.id, lockedAmount: take });

      await this.insertLedger(manager, {
        transactionId,
        sequenceNo,
        userId: params.userId,
        coinLotId: lot.id,
        entryType: CoinLedgerEntryType.SELL_ORDER_LOCKED,
        nonSellableDelta: '0',
        sellableDelta: `-${take}`,
        lockedNonSellableDelta: '0',
        lockedSellableDelta: take,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description ?? null,
      });
      sequenceNo += 1;
      remainingToLock -= BigInt(take);
    }

    if (remainingToLock > 0n) {
      throw CoinDomainException.sellableBalanceInsufficient();
    }

    wallet.sellableBalance = subAmount(wallet.sellableBalance, params.amount);
    wallet.lockedSellableBalance = addAmount(
      wallet.lockedSellableBalance,
      params.amount,
    );
    await manager.getRepository(UserCoinWalletEntity).save(wallet);

    return allocations;
  }

  /**
   * 판매 주문 취소 등: locked → available 복원.
   * allocations는 호출측이 sell_order_coin_lots 기준으로 계산한 unlock 가능량.
   */
  async releaseSellableInTransaction(
    manager: EntityManager,
    params: ReleaseSellableParams,
  ): Promise<Array<{ coinLotId: string; releasedAmount: string }>> {
    this.assertPositiveAmount(params.amount);
    const wallet = await this.lockWallet(manager, params.userId);

    if (BigInt(wallet.lockedSellableBalance) < BigInt(params.amount)) {
      throw CoinDomainException.sellableBalanceInsufficient();
    }

    const lotRepository = manager.getRepository(UserCoinLotEntity);
    let remainingToRelease = BigInt(params.amount);
    const transactionId = randomUUID();
    let sequenceNo = 1;
    const released: Array<{ coinLotId: string; releasedAmount: string }> = [];

    // LIFO: 할당 배열 끝부터 해제 (최근 Lot 우선)
    for (let i = params.allocations.length - 1; i >= 0; i -= 1) {
      if (remainingToRelease <= 0n) {
        break;
      }
      const alloc = params.allocations[i];
      if (BigInt(alloc.availableToRelease) <= 0n) {
        continue;
      }

      const lot = await lotRepository.findOne({
        where: { id: alloc.coinLotId, userId: params.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lot) {
        throw CoinDomainException.lotNotFound();
      }

      const take = minAmount(
        alloc.availableToRelease,
        remainingToRelease.toString(),
      );
      if (BigInt(lot.lockedAmount) < BigInt(take)) {
        throw CoinDomainException.lotNotAvailable();
      }

      lot.lockedAmount = subAmount(lot.lockedAmount, take);
      lot.remainingAmount = addAmount(lot.remainingAmount, take);
      lot.status = this.resolveLotStatus(lot);
      lot.consumedAt = null;
      await lotRepository.save(lot);

      released.push({ coinLotId: lot.id, releasedAmount: take });

      await this.insertLedger(manager, {
        transactionId,
        sequenceNo,
        userId: params.userId,
        coinLotId: lot.id,
        entryType: CoinLedgerEntryType.SELL_ORDER_RELEASED,
        nonSellableDelta: '0',
        sellableDelta: take,
        lockedNonSellableDelta: '0',
        lockedSellableDelta: `-${take}`,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description ?? null,
      });
      sequenceNo += 1;
      remainingToRelease -= BigInt(take);
    }

    if (remainingToRelease > 0n) {
      throw CoinDomainException.lotNotAvailable();
    }

    wallet.lockedSellableBalance = subAmount(
      wallet.lockedSellableBalance,
      params.amount,
    );
    wallet.sellableBalance = addAmount(wallet.sellableBalance, params.amount);
    await manager.getRepository(UserCoinWalletEntity).save(wallet);

    return released;
  }

  /**
   * 판매 주문 lock 상태 Lot을 실제 소비한다 (P2P 이전).
   * sellableBalance는 건드리지 않고 lockedSellableBalance만 감소한다.
   * 원장 1건(합산)을 남긴다.
   */
  async consumeLockedSellableInTransaction(
    manager: EntityManager,
    params: ConsumeLockedSellableParams,
  ): Promise<void> {
    const total = params.allocations.reduce(
      (sum, row) => sum + BigInt(row.amount),
      0n,
    );
    if (total <= 0n) {
      throw CoinDomainException.invalidAmount();
    }
    this.assertPositiveAmount(total.toString());

    const wallet = await this.lockWallet(manager, params.userId);
    if (BigInt(wallet.lockedSellableBalance) < total) {
      throw CoinDomainException.sellableBalanceInsufficient();
    }

    const lotRepository = manager.getRepository(UserCoinLotEntity);
    const now = new Date();

    for (const allocation of params.allocations) {
      if (BigInt(allocation.amount) <= 0n) {
        throw CoinDomainException.invalidAmount();
      }
      const lot = await lotRepository.findOne({
        where: { id: allocation.coinLotId, userId: params.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lot) {
        throw CoinDomainException.lotNotFound();
      }
      if (BigInt(lot.lockedAmount) < BigInt(allocation.amount)) {
        throw CoinDomainException.lotNotAvailable();
      }

      lot.lockedAmount = subAmount(lot.lockedAmount, allocation.amount);
      lot.consumedAmount = addAmount(lot.consumedAmount, allocation.amount);
      lot.status = this.resolveLotStatus(lot);
      if (lot.status === CoinLotStatus.FULLY_CONSUMED) {
        lot.consumedAt = now;
      }
      await lotRepository.save(lot);
    }

    wallet.lockedSellableBalance = subAmount(
      wallet.lockedSellableBalance,
      total.toString(),
    );
    await manager.getRepository(UserCoinWalletEntity).save(wallet);

    await this.insertLedger(manager, {
      transactionId: params.transactionId,
      sequenceNo: params.sequenceNo,
      userId: params.userId,
      coinLotId: params.allocations[0]?.coinLotId ?? null,
      entryType: params.entryType,
      nonSellableDelta: '0',
      sellableDelta: '0',
      lockedNonSellableDelta: '0',
      lockedSellableDelta: `-${total.toString()}`,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: params.description ?? null,
    });
  }

  private async credit(
    manager: EntityManager,
    params: CreditParams,
  ): Promise<void> {
    const wallet = await this.lockWallet(manager, params.userId);
    const now = new Date();
    const lotRepository = manager.getRepository(UserCoinLotEntity);
    const lot = lotRepository.create({
      userId: params.userId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      originalAmount: params.amount,
      remainingAmount: params.amount,
      lockedAmount: '0',
      consumedAmount: '0',
      isSellable: params.isSellable,
      status: CoinLotStatus.AVAILABLE,
      availableAt: now,
      consumedAt: null,
    });
    const savedLot = await lotRepository.save(lot);

    const transactionId = params.transactionId ?? randomUUID();
    await this.insertLedger(manager, {
      transactionId,
      sequenceNo: params.sequenceNo ?? 1,
      userId: params.userId,
      coinLotId: savedLot.id,
      entryType: params.entryType,
      nonSellableDelta: params.isSellable ? '0' : params.amount,
      sellableDelta: params.isSellable ? params.amount : '0',
      lockedNonSellableDelta: '0',
      lockedSellableDelta: '0',
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: params.description,
    });

    if (params.isSellable) {
      wallet.sellableBalance = addAmount(wallet.sellableBalance, params.amount);
    } else {
      wallet.nonSellableBalance = addAmount(
        wallet.nonSellableBalance,
        params.amount,
      );
    }
    await manager.getRepository(UserCoinWalletEntity).save(wallet);
  }

  private async debitBalance(
    manager: EntityManager,
    params: DebitParams,
  ): Promise<void> {
    const wallet = await this.lockWallet(manager, params.userId);
    const available = params.isSellable
      ? wallet.sellableBalance
      : wallet.nonSellableBalance;

    if (BigInt(available) < BigInt(params.amount)) {
      throw params.isSellable
        ? CoinDomainException.sellableBalanceInsufficient()
        : CoinDomainException.balanceInsufficient();
    }

    const lotRepository = manager.getRepository(UserCoinLotEntity);
    const lots = await lotRepository.find({
      where: {
        userId: params.userId,
        isSellable: params.isSellable,
        status: In([CoinLotStatus.AVAILABLE, CoinLotStatus.PARTIALLY_USED]),
      },
      order: { availableAt: 'ASC', id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    let remainingToDebit = BigInt(params.amount);
    const transactionId = params.transactionId ?? randomUUID();
    let sequenceNo = 1;
    const now = new Date();

    for (const lot of lots) {
      if (remainingToDebit <= 0n) {
        break;
      }
      if (BigInt(lot.remainingAmount) <= 0n) {
        continue;
      }

      const take = minAmount(lot.remainingAmount, remainingToDebit.toString());
      lot.remainingAmount = subAmount(lot.remainingAmount, take);
      lot.consumedAmount = addAmount(lot.consumedAmount, take);
      lot.status = this.resolveLotStatus(lot);
      if (lot.status === CoinLotStatus.FULLY_CONSUMED) {
        lot.consumedAt = now;
      }
      await lotRepository.save(lot);

      await this.insertLedger(manager, {
        transactionId,
        sequenceNo,
        userId: params.userId,
        coinLotId: lot.id,
        entryType: params.entryType,
        nonSellableDelta: params.isSellable ? '0' : `-${take}`,
        sellableDelta: params.isSellable ? `-${take}` : '0',
        lockedNonSellableDelta: '0',
        lockedSellableDelta: '0',
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description,
      });
      sequenceNo += 1;
      remainingToDebit -= BigInt(take);
    }

    if (remainingToDebit > 0n) {
      throw params.isSellable
        ? CoinDomainException.sellableBalanceInsufficient()
        : CoinDomainException.balanceInsufficient();
    }

    if (params.isSellable) {
      wallet.sellableBalance = subAmount(wallet.sellableBalance, params.amount);
    } else {
      wallet.nonSellableBalance = subAmount(
        wallet.nonSellableBalance,
        params.amount,
      );
    }
    await manager.getRepository(UserCoinWalletEntity).save(wallet);
  }

  private async lockWallet(
    manager: EntityManager,
    userId: string,
  ): Promise<UserCoinWalletEntity> {
    const wallet = await manager.getRepository(UserCoinWalletEntity).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw CoinDomainException.walletNotFound();
    }
    if (wallet.status === CoinWalletStatus.SUSPENDED) {
      throw CoinDomainException.walletSuspended();
    }
    if (wallet.status === CoinWalletStatus.CLOSED) {
      throw CoinDomainException.walletSuspended();
    }
    return wallet;
  }

  private async insertLedger(
    manager: EntityManager,
    input: {
      transactionId: string;
      sequenceNo: number;
      userId: string;
      coinLotId: string | null;
      entryType: CoinLedgerEntryType;
      nonSellableDelta: string;
      sellableDelta: string;
      lockedNonSellableDelta: string;
      lockedSellableDelta: string;
      referenceType: string;
      referenceId: string | null;
      description: string | null;
    },
  ): Promise<void> {
    const ledgerRepository = manager.getRepository(CoinLedgerEntryEntity);
    const entry = ledgerRepository.create(input);
    await ledgerRepository.save(entry);
  }

  private async writeAuditLog(
    manager: EntityManager,
    input: {
      actorUserId: string;
      actionType: AuditActionType;
      targetType: string;
      targetId: string;
      beforeData: Record<string, unknown>;
      afterData: Record<string, unknown>;
      reason: string;
      ipAddress: string | null;
    },
  ): Promise<void> {
    const auditRepository = manager.getRepository(AuditLogEntity);
    const log = auditRepository.create({
      actorUserId: input.actorUserId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeData: input.beforeData,
      afterData: input.afterData,
      reason: input.reason,
      ipAddress: input.ipAddress,
    });
    await auditRepository.save(log);
  }

  private pickWalletBalances(
    wallet: UserCoinWalletEntity,
  ): Record<string, unknown> {
    return {
      nonSellableBalance: wallet.nonSellableBalance,
      sellableBalance: wallet.sellableBalance,
      lockedNonSellableBalance: wallet.lockedNonSellableBalance,
      lockedSellableBalance: wallet.lockedSellableBalance,
    };
  }

  private walletSnapshot(
    wallet: UserCoinWalletEntity,
  ): Record<string, unknown> {
    return {
      nonSellableBalance: wallet.nonSellableBalance,
      sellableBalance: wallet.sellableBalance,
      lockedNonSellableBalance: wallet.lockedNonSellableBalance,
      lockedSellableBalance: wallet.lockedSellableBalance,
      pendingSellableBalance: wallet.pendingSellableBalance,
      status: wallet.status,
    };
  }

  private resolveLotStatus(lot: UserCoinLotEntity): CoinLotStatus {
    const remaining = BigInt(lot.remainingAmount);
    const locked = BigInt(lot.lockedAmount);
    const consumed = BigInt(lot.consumedAmount);

    if (remaining === 0n && locked === 0n) {
      return CoinLotStatus.FULLY_CONSUMED;
    }
    if (locked > 0n || consumed > 0n || remaining < BigInt(lot.originalAmount)) {
      return CoinLotStatus.PARTIALLY_USED;
    }
    return CoinLotStatus.AVAILABLE;
  }

  private assertIdempotencyKey(idempotencyKey: string): string {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw CoinDomainException.idempotencyKeyRequired();
    }
    if (!isUuid(key)) {
      throw CoinDomainException.invalidIdempotencyKey();
    }
    return key;
  }

  private async claimAdjustmentRequest(
    manager: EntityManager,
    input: {
      actorUserId: string;
      targetUserId: string;
      operation: AdminCoinAdjustmentOperation;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<
    | { kind: 'replay'; response: CoinWalletResponseDto }
    | { kind: 'proceed'; request: AdminCoinAdjustmentRequestEntity }
  > {
    const repository = manager.getRepository(AdminCoinAdjustmentRequestEntity);
    let existing = await repository.findOne({
      where: {
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!existing) {
      try {
        const created = repository.create({
          idempotencyKey: input.idempotencyKey,
          actorUserId: input.actorUserId,
          targetUserId: input.targetUserId,
          operation: input.operation,
          requestHash: input.requestHash,
          status: AdminCoinAdjustmentRequestStatus.IN_PROGRESS,
          responseBody: null,
          ledgerTransactionId: null,
          failureCode: null,
        });
        existing = await repository.save(created);
        return { kind: 'proceed', request: existing };
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
        existing = await repository.findOne({
          where: {
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!existing) {
          throw error;
        }
      }
    }

    return this.resolveExistingAdjustmentRequest(
      repository,
      existing,
      input.requestHash,
    );
  }

  private async resolveExistingAdjustmentRequest(
    repository: Repository<AdminCoinAdjustmentRequestEntity>,
    existing: AdminCoinAdjustmentRequestEntity,
    requestHash: string,
  ): Promise<
    | { kind: 'replay'; response: CoinWalletResponseDto }
    | { kind: 'proceed'; request: AdminCoinAdjustmentRequestEntity }
  > {
    if (existing.status === AdminCoinAdjustmentRequestStatus.SUCCEEDED) {
      if (existing.requestHash !== requestHash) {
        throw CoinDomainException.idempotencyKeyConflict();
      }
      if (!existing.responseBody) {
        throw CoinDomainException.idempotencyKeyConflict();
      }
      return {
        kind: 'replay',
        response: existing.responseBody as unknown as CoinWalletResponseDto,
      };
    }

    if (existing.status === AdminCoinAdjustmentRequestStatus.IN_PROGRESS) {
      const ageMs = Date.now() - existing.updatedAt.getTime();
      if (ageMs < ADMIN_COIN_ADJUSTMENT_IN_PROGRESS_STALE_MS) {
        throw CoinDomainException.requestInProgress();
      }
    }

    if (existing.requestHash !== requestHash) {
      throw CoinDomainException.idempotencyKeyConflict();
    }

    existing.status = AdminCoinAdjustmentRequestStatus.IN_PROGRESS;
    existing.responseBody = null;
    existing.ledgerTransactionId = null;
    existing.failureCode = null;
    existing.requestHash = requestHash;
    const saved = await repository.save(existing);
    return { kind: 'proceed', request: saved };
  }

  private async completeAdjustmentRequest(
    manager: EntityManager,
    request: AdminCoinAdjustmentRequestEntity,
    input: {
      response: CoinWalletResponseDto;
      ledgerTransactionId: string;
    },
  ): Promise<void> {
    const repository = manager.getRepository(AdminCoinAdjustmentRequestEntity);
    request.status = AdminCoinAdjustmentRequestStatus.SUCCEEDED;
    request.responseBody = { ...input.response };
    request.ledgerTransactionId = input.ledgerTransactionId;
    request.failureCode = null;
    await repository.save(request);
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  private assertPositiveAmount(amount: string): void {
    if (!isPositiveAmountString(amount)) {
      throw CoinDomainException.invalidAmount();
    }
  }

  private async assertUserActive(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw CoinDomainException.userNotFound();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw CoinDomainException.userNotActive();
    }
    return user;
  }

  private async assertUserActiveInTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw CoinDomainException.userNotFound();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw CoinDomainException.userNotActive();
    }
  }

  /** from=YYYY-MM-DD → 해당 KST 00:00의 UTC */
  private kstDayStartUtc(date: string): Date {
    return new Date(`${date}T00:00:00+09:00`);
  }

  /** to=YYYY-MM-DD → 다음날 KST 00:00 UTC (exclusive) */
  private kstDayEndExclusiveUtc(date: string): Date {
    const start = this.kstDayStartUtc(date);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  private toPurchaseResponse(
    purchase: CoinPurchaseEntity,
  ): CoinPurchaseResponseDto {
    return {
      id: purchase.id,
      userId: purchase.userId,
      amount: purchase.amount,
      status: purchase.status,
      completedAt: purchase.completedAt,
      createdAt: purchase.createdAt,
    };
  }
}
