import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { maskAccountNumber } from '../../common/utils/account-crypto.util';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { AuditLogEntity } from '../admins/infrastructure/entities/audit-log.entity';
import { BanksService } from '../banks/banks.service';
import { CoinService } from '../coins/coin.service';
import { NotificationEventType } from '../notifications/domain/enums/notification-event-type.enum';
import { NotificationReferenceType } from '../notifications/domain/enums/notification-reference-type.enum';
import { NotificationService } from '../notifications/notification.service';
import { CoinLedgerEntryType } from '../coins/domain/enums/coin-ledger-entry-type.enum';
import { CoinSourceType } from '../coins/domain/enums/coin-source-type.enum';
import {
  addAmount,
  subAmount,
} from '../coins/utils/coin-amount.util';
import { BuyOrderStatus } from '../orders/domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../orders/domain/enums/sell-order-status.enum';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../orders/infrastructure/entities/matching-policy.entity';
import { SellOrderCoinLotEntity } from '../orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { nextOrderNumber } from '../orders/utils/order-number.util';
import { deriveSellOrderStatus } from '../orders/utils/sell-order-status.util';
import { UserProfileEntity } from '../users/infrastructure/entities/user-profile.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import type { AdminPartySummary } from '../users/dto/admin-party.dto';
import { UserService } from '../users/user.service';
import {
  TRADE_LEDGER_REFERENCE_TYPE,
  TRADE_TIMEOUT_BATCH_SIZE,
  TRANSFER_RECOVERY_MIN_AGE_MS,
} from './domain/constants/trade.constants';
import { TradeDisputePriority } from './domain/enums/trade-dispute-priority.enum';
import { TradeDisputeStatus } from './domain/enums/trade-dispute-status.enum';
import { TradeEventActorType } from './domain/enums/trade-event-actor-type.enum';
import { TradeEventCode } from './domain/enums/trade-event-code.enum';
import { TradeStatus } from './domain/enums/trade-status.enum';
import {
  AdminTradeCoinLotDto,
  AdminTradeDetailDto,
  AdminTradeEventDto,
  AdminTradeListItemDto,
} from './dto/admin-trade-response.dto';
import {
  AdminOpenDisputeDto,
  AdminTradeReasonDto,
} from './dto/admin-trade-command.dto';
import {
  SearchAdminTradeTimeoutsDto,
  SearchAdminTradesDto,
  SearchMyTradesDto,
} from './dto/search-trades.dto';
import {
  TradeActionsDto,
  TradeListItemDto,
  TradeResponseDto,
  TradeViewerRole,
} from './dto/trade-response.dto';
import { TradeDomainException } from './exceptions/trade.exceptions';
import { TradeCoinLotEntity } from './infrastructure/entities/trade-coin-lot.entity';
import { TradeDisputeEntity } from './infrastructure/entities/trade-dispute.entity';
import { TradeEventEntity } from './infrastructure/entities/trade-event.entity';
import { TradeEntity } from './infrastructure/entities/trade.entity';
import { maskNickname } from './utils/nickname-mask.util';

export type SellerBankSnapshot = {
  bankAccountId: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
};

export type CreateMatchedTradeInput = {
  buyOrderId: string;
  sellOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  coinAmount: string;
  sellerBank: SellerBankSnapshot;
  buyerPaymentTimeoutSeconds: number;
  sellerConfirmationTimeoutSeconds: number;
  lotAllocations: Array<{ coinLotId: string; allocatedAmount: string }>;
  now: Date;
  /** Accept 경로. 기존 /match 는 null */
  tradeRequestId?: string | null;
};

type ExtraFlags = {
  alreadyReported?: boolean;
  alreadyConfirmed?: boolean;
  alreadyCancelled?: boolean;
};

type PartyRole = 'BUYER' | 'SELLER' | 'PARTY';

/**
 * Trade 생성·조회·입금/확인/취소·Coin 이전.
 */
@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly coinService: CoinService,
    private readonly userService: UserService,
    private readonly banksService: BanksService,
    private readonly notificationService: NotificationService,
    @InjectRepository(TradeEntity)
    private readonly tradeRepository: Repository<TradeEntity>,
    @InjectRepository(TradeEventEntity)
    private readonly tradeEventRepository: Repository<TradeEventEntity>,
    @InjectRepository(TradeCoinLotEntity)
    private readonly tradeCoinLotRepository: Repository<TradeCoinLotEntity>,
    @InjectRepository(TradeDisputeEntity)
    private readonly tradeDisputeRepository: Repository<TradeDisputeEntity>,
    @InjectRepository(MatchingPolicyEntity)
    private readonly matchingPolicyRepository: Repository<MatchingPolicyEntity>,
  ) {}

  async createMatchedTradeInTransaction(
    manager: EntityManager,
    input: CreateMatchedTradeInput,
  ): Promise<TradeEntity> {
    if (input.lotAllocations.length === 0) {
      throw TradeDomainException.creationFailed();
    }

    const allocatedSum = input.lotAllocations.reduce(
      (sum, row) => sum + BigInt(row.allocatedAmount),
      0n,
    );
    if (allocatedSum !== BigInt(input.coinAmount)) {
      throw TradeDomainException.creationFailed();
    }

    const tradeNumber = await nextOrderNumber(manager, 'TO');
    const dueAt = new Date(
      input.now.getTime() + input.buyerPaymentTimeoutSeconds * 1000,
    );

    const tradeRepository = manager.getRepository(TradeEntity);
    const trade = tradeRepository.create({
      tradeNumber,
      buyOrderId: input.buyOrderId,
      sellOrderId: input.sellOrderId,
      buyerUserId: input.buyerUserId,
      sellerUserId: input.sellerUserId,
      tradeRequestId: input.tradeRequestId ?? null,
      sellerBankAccountId: input.sellerBank.bankAccountId,
      sellerBankCode: input.sellerBank.bankCode,
      sellerAccountNumber: input.sellerBank.accountNumber,
      sellerAccountHolderName: input.sellerBank.accountHolderName,
      coinAmount: input.coinAmount,
      paymentAmount: input.coinAmount,
      status: TradeStatus.WAITING_BUYER_PAYMENT,
      buyerPaymentTimeoutSeconds: input.buyerPaymentTimeoutSeconds,
      buyerPaymentDueAt: dueAt,
      sellerConfirmationTimeoutSeconds: input.sellerConfirmationTimeoutSeconds,
      sellerConfirmationDueAt: null,
      buyerReportedPaidAt: null,
      sellerConfirmedAt: null,
      coinTransferStartedAt: null,
      coinTransferredAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    });

    let saved: TradeEntity;
    try {
      saved = await tradeRepository.save(trade);
    } catch {
      throw TradeDomainException.creationFailed();
    }

    const lotRepository = manager.getRepository(TradeCoinLotEntity);
    for (const allocation of input.lotAllocations) {
      await lotRepository.save(
        lotRepository.create({
          tradeId: saved.id,
          coinLotId: allocation.coinLotId,
          allocatedAmount: allocation.allocatedAmount,
          transferredAmount: '0',
          returnedAmount: '0',
        }),
      );
    }

    await this.appendEvent(manager, {
      trade: saved,
      previousStatus: null,
      newStatus: TradeStatus.WAITING_BUYER_PAYMENT,
      eventCode: TradeEventCode.TRADE_CREATED,
      actorType: TradeEventActorType.SYSTEM,
      actorUserId: null,
      metadata: {
        buyOrderId: input.buyOrderId,
        sellOrderId: input.sellOrderId,
      },
    });

    return saved;
  }

  async findByBuyOrderIdInTransaction(
    manager: EntityManager,
    buyOrderId: string,
  ): Promise<TradeEntity | null> {
    return manager.getRepository(TradeEntity).findOne({
      where: { buyOrderId },
    });
  }

  async findByBuyOrderId(buyOrderId: string): Promise<TradeEntity | null> {
    return this.tradeRepository.findOne({ where: { buyOrderId } });
  }

  async listMyTrades(
    userId: string,
    query: SearchMyTradesDto,
  ): Promise<{ items: TradeListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: FindOptionsWhere<TradeEntity>[] = query.status
      ? [
          { buyerUserId: userId, status: query.status },
          { sellerUserId: userId, status: query.status },
        ]
      : [{ buyerUserId: userId }, { sellerUserId: userId }];

    const [rows, totalItems] = await this.tradeRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => this.toListItem(row, userId)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getMyTrade(
    userId: string,
    tradeId: string,
    flags: ExtraFlags = {},
  ): Promise<TradeResponseDto> {
    const trade = await this.tradeRepository.findOne({ where: { id: tradeId } });
    if (!trade) {
      throw TradeDomainException.notFound();
    }
    this.assertParty(trade, userId, 'PARTY');
    const events = await this.loadEvents(trade.id);
    return this.toUserResponse(trade, userId, events, flags);
  }

  async reportPayment(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    let alreadyReported = false;
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'BUYER');

      if (trade.status === TradeStatus.WAITING_SELLER_CONFIRMATION) {
        alreadyReported = true;
        return;
      }
      if (
        trade.status !== TradeStatus.WAITING_BUYER_PAYMENT &&
        trade.status !== TradeStatus.PAYMENT_TIMEOUT
      ) {
        throw TradeDomainException.invalidStatus();
      }

      const previous = trade.status;
      const now = new Date();
      const late = previous === TradeStatus.PAYMENT_TIMEOUT;
      trade.status = TradeStatus.WAITING_SELLER_CONFIRMATION;
      trade.buyerReportedPaidAt = now;
      trade.sellerConfirmationDueAt = new Date(
        now.getTime() + trade.sellerConfirmationTimeoutSeconds * 1000,
      );
      await manager.getRepository(TradeEntity).save(trade);
      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.BUYER_REPORTED_PAYMENT,
        actorType: TradeEventActorType.BUYER,
        actorUserId: userId,
        metadata: { late },
      });
      await this.notificationService.enqueueTradePushInTransaction(manager, {
        eventType: NotificationEventType.TRADE_PAYMENT_REPORTED,
        actorUserId: userId,
        referenceType: NotificationReferenceType.TRADE,
        referenceId: trade.id,
        deepLink: `/trade?tradeId=${trade.id}`,
        recipientUserId: trade.sellerUserId,
        recipientRole: 'SELLER',
        tradeId: trade.id,
      });
    });

    return this.getMyTrade(userId, tradeId, { alreadyReported });
  }

  async confirmPayment(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    let alreadyConfirmed = false;

    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'SELLER');

      if (
        trade.status === TradeStatus.COIN_TRANSFERRING ||
        trade.status === TradeStatus.COMPLETED
      ) {
        alreadyConfirmed = true;
        return;
      }
      if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
        throw TradeDomainException.invalidStatus();
      }

      const now = new Date();
      const previous = trade.status;
      trade.status = TradeStatus.COIN_TRANSFERRING;
      trade.sellerConfirmedAt = now;
      trade.coinTransferStartedAt = now;
      await manager.getRepository(TradeEntity).save(trade);
      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.SELLER_CONFIRMED_PAYMENT,
        actorType: TradeEventActorType.SELLER,
        actorUserId: userId,
      });
      await this.appendEvent(manager, {
        trade,
        previousStatus: TradeStatus.COIN_TRANSFERRING,
        newStatus: TradeStatus.COIN_TRANSFERRING,
        eventCode: TradeEventCode.COIN_TRANSFER_STARTED,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
      });
    });

    try {
      await this.transferTradeCoin(tradeId);
    } catch (error) {
      this.logger.warn(
        `coin transfer deferred for trade=${tradeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.getMyTrade(userId, tradeId, { alreadyConfirmed });
  }

  async cancelTrade(
    userId: string,
    tradeId: string,
    reason?: string,
  ): Promise<TradeResponseDto> {
    let alreadyCancelled = false;
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'PARTY');

      if (trade.status === TradeStatus.CANCELLED) {
        alreadyCancelled = true;
        return;
      }
      if (trade.status === TradeStatus.COMPLETED) {
        throw TradeDomainException.alreadyCompleted();
      }
      if (
        trade.status !== TradeStatus.WAITING_BUYER_PAYMENT ||
        trade.buyerReportedPaidAt !== null
      ) {
        throw TradeDomainException.cannotCancelAfterPayment();
      }

      const buyOrderMode =
        userId === trade.sellerUserId ? 'REMATCH' : 'CANCEL';
      await this.finalizeCancelledInTransaction(manager, {
        trade,
        actorType:
          userId === trade.buyerUserId
            ? TradeEventActorType.BUYER
            : TradeEventActorType.SELLER,
        actorUserId: userId,
        reason: reason ?? '입금 전 취소',
        buyOrderMode,
      });
    });

    return this.getMyTrade(userId, tradeId, { alreadyCancelled });
  }

  async requestCancellation(
    userId: string,
    tradeId: string,
    reason?: string,
  ): Promise<TradeResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'PARTY');
      this.assertWaitingSellerConfirmation(trade);

      const existing = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.CANCELLATION_REQUESTED,
      );
      if (existing) {
        if (existing.actorUserId === userId) {
          return;
        }
        throw TradeDomainException.invalidStatus();
      }

      await this.appendEvent(manager, {
        trade,
        previousStatus: trade.status,
        newStatus: trade.status,
        eventCode: TradeEventCode.CANCELLATION_REQUESTED,
        actorType: this.actorTypeOf(trade, userId),
        actorUserId: userId,
        metadata: { reason: reason ?? null },
      });
    });
    return this.getMyTrade(userId, tradeId);
  }

  async agreeCancellation(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'PARTY');
      this.assertWaitingSellerConfirmation(trade);

      const requested = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.CANCELLATION_REQUESTED,
      );
      if (!requested || requested.actorUserId === userId) {
        throw TradeDomainException.invalidStatus();
      }

      const agreed = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.CANCELLATION_AGREED,
      );
      if (agreed) {
        return;
      }

      await this.appendEvent(manager, {
        trade,
        previousStatus: trade.status,
        newStatus: trade.status,
        eventCode: TradeEventCode.CANCELLATION_AGREED,
        actorType: this.actorTypeOf(trade, userId),
        actorUserId: userId,
      });
    });
    return this.getMyTrade(userId, tradeId);
  }

  async reportRefund(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'SELLER');
      this.assertWaitingSellerConfirmation(trade);

      const agreed = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.CANCELLATION_AGREED,
      );
      if (!agreed) {
        throw TradeDomainException.invalidStatus();
      }
      const reported = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.REFUND_REPORTED,
      );
      if (reported) {
        return;
      }

      await this.appendEvent(manager, {
        trade,
        previousStatus: trade.status,
        newStatus: trade.status,
        eventCode: TradeEventCode.REFUND_REPORTED,
        actorType: TradeEventActorType.SELLER,
        actorUserId: userId,
      });
    });
    return this.getMyTrade(userId, tradeId);
  }

  async confirmRefund(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'BUYER');

      if (trade.status === TradeStatus.CANCELLED) {
        return;
      }
      this.assertWaitingSellerConfirmation(trade);

      const reported = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.REFUND_REPORTED,
      );
      if (!reported) {
        throw TradeDomainException.invalidStatus();
      }
      const confirmed = await this.findEvent(
        manager,
        trade.id,
        TradeEventCode.REFUND_CONFIRMED,
      );
      if (!confirmed) {
        await this.appendEvent(manager, {
          trade,
          previousStatus: trade.status,
          newStatus: trade.status,
          eventCode: TradeEventCode.REFUND_CONFIRMED,
          actorType: TradeEventActorType.BUYER,
          actorUserId: userId,
        });
      }

      await this.finalizeCancelledInTransaction(manager, {
        trade,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
        reason: '거래 당사자 합의',
        buyOrderMode: 'CANCEL',
      });
    });
    return this.getMyTrade(userId, tradeId);
  }

  async markUnpaid(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    await this.markUnpaidInTransaction(tradeId, {
      actorType: TradeEventActorType.SELLER,
      actorUserId: userId,
      requireSeller: true,
    });
    return this.getMyTrade(userId, tradeId);
  }

  async adminMarkUnpaid(adminUserId: string, tradeId: string): Promise<AdminTradeDetailDto> {
    return this.confirmNonPayment(adminUserId, tradeId, { reason: '미입금 확정' });
  }

  async confirmNonPayment(
    adminUserId: string,
    tradeId: string,
    dto: AdminTradeReasonDto,
    ipAddress: string | null = null,
  ): Promise<AdminTradeDetailDto> {
    await this.markUnpaidInTransaction(tradeId, {
      actorType: TradeEventActorType.ADMIN,
      actorUserId: adminUserId,
      requireSeller: false,
      reason: dto.reason,
      adminAudit: { ipAddress },
    });
    return this.getAdminTrade(tradeId);
  }

  async acknowledgeLatePayment(
    adminUserId: string,
    tradeId: string,
  ): Promise<AdminTradeDetailDto> {
    return this.confirmLatePayment(adminUserId, tradeId, {
      reason: '늦은 입금 확인',
    });
  }

  async confirmLatePayment(
    adminUserId: string,
    tradeId: string,
    dto: AdminTradeReasonDto,
    ipAddress: string | null = null,
  ): Promise<AdminTradeDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (trade.status === TradeStatus.WAITING_SELLER_CONFIRMATION) {
        return;
      }
      if (trade.status !== TradeStatus.PAYMENT_TIMEOUT) {
        throw TradeDomainException.invalidStatus();
      }

      const now = new Date();
      const previous = trade.status;
      trade.status = TradeStatus.WAITING_SELLER_CONFIRMATION;
      trade.sellerConfirmationDueAt = new Date(
        now.getTime() + trade.sellerConfirmationTimeoutSeconds * 1000,
      );
      await manager.getRepository(TradeEntity).save(trade);
      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.ADMIN_CONFIRMED_LATE_PAYMENT,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        metadata: { reason: dto.reason },
      });
      await this.writeAdminAudit(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_CONFIRM_LATE_PAYMENT,
        targetId: trade.id,
        reason: dto.reason,
        afterData: { tradeId: trade.id, status: trade.status },
        ipAddress,
      });
    });
    return this.getAdminTrade(tradeId);
  }

  async openDispute(
    adminUserId: string,
    tradeId: string,
    dto: AdminOpenDisputeDto,
    ipAddress: string | null = null,
  ): Promise<AdminTradeDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (
        trade.status === TradeStatus.COMPLETED ||
        trade.status === TradeStatus.CANCELLED
      ) {
        throw TradeDomainException.invalidStatus();
      }
      if (trade.status === TradeStatus.DISPUTED) {
        throw TradeDomainException.disputeAlreadyExists();
      }

      const existingDispute = await manager
        .getRepository(TradeDisputeEntity)
        .findOne({ where: { tradeId: trade.id } });
      if (existingDispute) {
        throw TradeDomainException.disputeAlreadyExists();
      }

      const previous = trade.status;
      trade.status = TradeStatus.DISPUTED;
      await manager.getRepository(TradeEntity).save(trade);

      const disputeNumber = await nextOrderNumber(manager, 'TD');
      const now = new Date();
      await manager.getRepository(TradeDisputeEntity).save(
        manager.getRepository(TradeDisputeEntity).create({
          disputeNumber,
          tradeId: trade.id,
          reasonCode: dto.reasonCode,
          status: TradeDisputeStatus.OPEN_UNASSIGNED,
          priority: TradeDisputePriority.NORMAL,
          requestedByUserId: null,
          assignedAdminUserId: null,
          leaderAdminUserId: null,
          resolution: null,
          resolutionReason: dto.reason,
          requestedAt: now,
          assignedAt: null,
          resolvedAt: null,
        }),
      );

      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.ADMIN_OPENED_DISPUTE,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        metadata: { reasonCode: dto.reasonCode, reason: dto.reason },
      });
      await this.writeAdminAudit(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_OPEN_TRADE_DISPUTE,
        targetId: trade.id,
        reason: dto.reason,
        afterData: {
          tradeId: trade.id,
          status: trade.status,
          reasonCode: dto.reasonCode,
        },
        ipAddress,
      });
    });
    return this.getAdminTrade(tradeId);
  }

  async listAdminTrades(
    query: SearchAdminTradesDto,
  ): Promise<{ items: AdminTradeListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.createAdminTradeListQueryBuilder();
    this.applyAdminTradeListFilters(qb, query);

    const [rows, totalItems] = await qb
      .orderBy('trade.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const parties = await this.userService.getAdminPartySummaries(
      rows.flatMap((row) => [row.buyerUserId, row.sellerUserId]),
    );

    return {
      items: rows.map((row) => this.toAdminTradeListItem(row, parties)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async listAdminTradeTimeouts(
    query: SearchAdminTradeTimeoutsDto,
  ): Promise<{ items: AdminTradeListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.createAdminTradeListQueryBuilder();
    this.applyAdminTradeTimeoutFilter(qb);
    if (query.keyword?.trim()) {
      this.applyAdminTradeKeywordFilter(qb, query.keyword.trim());
    }
    if (query.createdFrom) {
      qb.andWhere('trade.created_at >= :createdFrom', {
        createdFrom: query.createdFrom,
      });
    }
    if (query.createdTo) {
      qb.andWhere('trade.created_at <= :createdTo', {
        createdTo: query.createdTo,
      });
    }

    const [rows, totalItems] = await qb
      .orderBy('trade.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const parties = await this.userService.getAdminPartySummaries(
      rows.flatMap((row) => [row.buyerUserId, row.sellerUserId]),
    );

    return {
      items: rows.map((row) => this.toAdminTradeListItem(row, parties)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getAdminTradeEvents(tradeId: string): Promise<AdminTradeEventDto[]> {
    await this.assertAdminTradeExists(tradeId);
    const events = await this.loadEvents(tradeId);
    return events.map((event) => this.toAdminTradeEvent(event));
  }

  async getAdminTradeCoinLots(tradeId: string): Promise<AdminTradeCoinLotDto[]> {
    await this.assertAdminTradeExists(tradeId);
    const lots = await this.tradeCoinLotRepository.find({
      where: { tradeId },
      order: { coinLotId: 'ASC' },
    });
    return lots.map((lot) => ({
      coinLotId: lot.coinLotId,
      allocatedAmount: lot.allocatedAmount,
      transferredAmount: lot.transferredAmount,
      returnedAmount: lot.returnedAmount,
    }));
  }

  async getAdminTrade(tradeId: string): Promise<AdminTradeDetailDto> {
    const trade = await this.tradeRepository.findOne({ where: { id: tradeId } });
    if (!trade) {
      throw TradeDomainException.notFound();
    }

    const [events, lots, dispute, buyOrder, sellOrder, bankName, parties] =
      await Promise.all([
        this.loadEvents(trade.id),
        this.tradeCoinLotRepository.find({ where: { tradeId: trade.id } }),
        this.tradeDisputeRepository.findOne({ where: { tradeId: trade.id } }),
        this.dataSource.getRepository(BuyOrderEntity).findOne({
          where: { id: trade.buyOrderId },
        }),
        this.dataSource.getRepository(SellOrderEntity).findOne({
          where: { id: trade.sellOrderId },
        }),
        this.resolveBankName(trade.sellerBankCode),
        this.userService.getAdminPartySummaries([
          trade.buyerUserId,
          trade.sellerUserId,
        ]),
      ]);

    return {
      id: trade.id,
      tradeNumber: trade.tradeNumber,
      status: trade.status,
      coinAmount: trade.coinAmount,
      paymentAmount: trade.paymentAmount,
      buyer: this.userService.toAdminPartyDto(parties.get(trade.buyerUserId)),
      seller: this.userService.toAdminPartyDto(parties.get(trade.sellerUserId)),
      sellerBankAccount: {
        bankCode: trade.sellerBankCode,
        bankName,
        accountNumber: maskAccountNumber(trade.sellerAccountNumber),
        holderName: trade.sellerAccountHolderName,
      },
      buyOrder: {
        id: trade.buyOrderId,
        orderNumber: buyOrder?.orderNumber ?? '',
      },
      sellOrder: {
        id: trade.sellOrderId,
        orderNumber: sellOrder?.orderNumber ?? '',
      },
      coinLots: lots.map((lot) => ({
        coinLotId: lot.coinLotId,
        allocatedAmount: lot.allocatedAmount,
        transferredAmount: lot.transferredAmount,
        returnedAmount: lot.returnedAmount,
      })),
      events: events.map((event) => this.toAdminTradeEvent(event)),
      dispute: dispute
        ? {
            id: dispute.id,
            disputeNumber: dispute.disputeNumber,
            status: dispute.status,
            priority: dispute.priority,
            reasonCode: dispute.reasonCode,
            requestedAt: dispute.requestedAt,
          }
        : null,
      buyerPaymentDueAt: trade.buyerPaymentDueAt,
      buyerPaymentTimeoutSeconds: trade.buyerPaymentTimeoutSeconds,
      sellerConfirmationDueAt: trade.sellerConfirmationDueAt,
      sellerConfirmationTimeoutSeconds: trade.sellerConfirmationTimeoutSeconds,
      buyerReportedPaidAt: trade.buyerReportedPaidAt,
      sellerConfirmedAt: trade.sellerConfirmedAt,
      completedAt: trade.completedAt,
      cancelledAt: trade.cancelledAt,
      createdAt: trade.createdAt,
    };
  }

  async expireDueBuyerPayments(
    limit = TRADE_TIMEOUT_BATCH_SIZE,
  ): Promise<number> {
    let processed = 0;
    for (let i = 0; i < limit; i += 1) {
      const did = await this.expireOneBuyerPayment();
      if (!did) {
        break;
      }
      processed += 1;
    }
    return processed;
  }

  async expireDueSellerConfirmations(
    limit = TRADE_TIMEOUT_BATCH_SIZE,
  ): Promise<number> {
    let processed = 0;
    for (let i = 0; i < limit; i += 1) {
      const did = await this.expireOneSellerConfirmation();
      if (!did) {
        break;
      }
      processed += 1;
    }
    return processed;
  }

  async recoverStuckTransfers(
    limit = TRADE_TIMEOUT_BATCH_SIZE,
  ): Promise<number> {
    let processed = 0;
    for (let i = 0; i < limit; i += 1) {
      const did = await this.recoverOneStuckTransfer();
      if (!did) {
        break;
      }
      processed += 1;
    }
    return processed;
  }

  async transferTradeCoin(tradeId: string): Promise<TradeEntity> {
    return this.dataSource.transaction(async (manager) =>
      this.transferTradeCoinInTransaction(manager, tradeId),
    );
  }

  private async transferTradeCoinInTransaction(
    manager: EntityManager,
    tradeId: string,
  ): Promise<TradeEntity> {
    const trade = await this.lockTrade(manager, tradeId);
    if (trade.status === TradeStatus.COMPLETED) {
      return trade;
    }
    if (trade.status !== TradeStatus.COIN_TRANSFERRING) {
      throw TradeDomainException.invalidStatus();
    }

    const tradeLots = await manager.getRepository(TradeCoinLotEntity).find({
      where: { tradeId: trade.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (tradeLots.length === 0) {
      throw TradeDomainException.coinTransferFailed();
    }

    await this.coinService.consumeLockedSellableInTransaction(manager, {
      userId: trade.sellerUserId,
      allocations: tradeLots.map((lot) => ({
        coinLotId: lot.coinLotId,
        amount: lot.allocatedAmount,
      })),
      entryType: CoinLedgerEntryType.P2P_TRANSFER_OUT,
      referenceType: TRADE_LEDGER_REFERENCE_TYPE,
      referenceId: trade.id,
      description: `P2P 이전 출금 ${trade.tradeNumber}`,
      transactionId: trade.id,
      sequenceNo: 1,
    });

    await this.coinService.creditSellable(manager, {
      userId: trade.buyerUserId,
      amount: trade.coinAmount,
      sourceType: CoinSourceType.P2P_PURCHASE,
      sourceId: trade.id,
      entryType: CoinLedgerEntryType.P2P_TRANSFER_IN,
      referenceType: TRADE_LEDGER_REFERENCE_TYPE,
      referenceId: trade.id,
      description: `P2P 이전 입금 ${trade.tradeNumber}`,
      isSellable: true,
      transactionId: trade.id,
      sequenceNo: 2,
    });

    const now = new Date();
    const sellOrder = await manager.getRepository(SellOrderEntity).findOne({
      where: { id: trade.sellOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!sellOrder) {
      throw TradeDomainException.coinTransferFailed();
    }

    sellOrder.reservedCoinAmount = subAmount(
      sellOrder.reservedCoinAmount,
      trade.coinAmount,
    );
    sellOrder.completedCoinAmount = addAmount(
      sellOrder.completedCoinAmount,
      trade.coinAmount,
    );
    if (sellOrder.status !== SellOrderStatus.CANCELLED) {
      sellOrder.status = deriveSellOrderStatus(
        BigInt(sellOrder.remainingCoinAmount),
        BigInt(sellOrder.reservedCoinAmount),
      );
      if (sellOrder.status === SellOrderStatus.COMPLETED) {
        sellOrder.completedAt = now;
      }
    }
    await manager.getRepository(SellOrderEntity).save(sellOrder);

    for (const lot of tradeLots) {
      const sellLot = await manager.getRepository(SellOrderCoinLotEntity).findOne({
        where: { sellOrderId: trade.sellOrderId, coinLotId: lot.coinLotId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sellLot) {
        throw TradeDomainException.coinTransferFailed();
      }
      sellLot.consumedAmount = addAmount(
        sellLot.consumedAmount,
        lot.allocatedAmount,
      );
      await manager.getRepository(SellOrderCoinLotEntity).save(sellLot);

      lot.transferredAmount = lot.allocatedAmount;
      await manager.getRepository(TradeCoinLotEntity).save(lot);
    }

    const buyOrder = await manager.getRepository(BuyOrderEntity).findOne({
      where: { id: trade.buyOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (buyOrder) {
      buyOrder.status = BuyOrderStatus.COMPLETED;
      buyOrder.completedAt = now;
      await manager.getRepository(BuyOrderEntity).save(buyOrder);
    }

    const previous = trade.status;
    trade.status = TradeStatus.COMPLETED;
    trade.coinTransferredAt = now;
    trade.completedAt = now;
    await manager.getRepository(TradeEntity).save(trade);
    await this.appendEvent(manager, {
      trade,
      previousStatus: previous,
      newStatus: trade.status,
      eventCode: TradeEventCode.COIN_TRANSFER_COMPLETED,
      actorType: TradeEventActorType.SYSTEM,
      actorUserId: null,
    });
    await this.appendEvent(manager, {
      trade,
      previousStatus: TradeStatus.COMPLETED,
      newStatus: TradeStatus.COMPLETED,
      eventCode: TradeEventCode.TRADE_COMPLETED,
      actorType: TradeEventActorType.SYSTEM,
      actorUserId: null,
    });
    const completedDeepLink = `/trade?tradeId=${trade.id}`;
    await this.notificationService.enqueueTradePushInTransaction(manager, {
      eventType: NotificationEventType.TRADE_COMPLETED,
      actorUserId: null,
      referenceType: NotificationReferenceType.TRADE,
      referenceId: trade.id,
      deepLink: completedDeepLink,
      recipientUserId: trade.buyerUserId,
      recipientRole: 'BUYER',
      tradeId: trade.id,
      buyOrderId: trade.buyOrderId,
    });
    await this.notificationService.enqueueTradePushInTransaction(manager, {
      eventType: NotificationEventType.TRADE_COMPLETED,
      actorUserId: null,
      referenceType: NotificationReferenceType.TRADE,
      referenceId: trade.id,
      deepLink: completedDeepLink,
      recipientUserId: trade.sellerUserId,
      recipientRole: 'SELLER',
      tradeId: trade.id,
      buyOrderId: trade.buyOrderId,
    });

    return trade;
  }

  private async expireOneBuyerPayment(): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `
        SELECT id
        FROM trades
        WHERE status = $1
          AND buyer_payment_due_at <= NOW()
        ORDER BY buyer_payment_due_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `,
        [TradeStatus.WAITING_BUYER_PAYMENT],
      );
      if (rows.length === 0) {
        return false;
      }
      const trade = await this.lockTrade(manager, rows[0].id);
      if (trade.status !== TradeStatus.WAITING_BUYER_PAYMENT) {
        return false;
      }
      const previous = trade.status;
      trade.status = TradeStatus.PAYMENT_TIMEOUT;
      await manager.getRepository(TradeEntity).save(trade);
      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.BUYER_PAYMENT_TIMED_OUT,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
      });
      return true;
    });
  }

  private async expireOneSellerConfirmation(): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `
        SELECT id
        FROM trades
        WHERE status = $1
          AND seller_confirmation_due_at IS NOT NULL
          AND seller_confirmation_due_at <= NOW()
        ORDER BY seller_confirmation_due_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `,
        [TradeStatus.WAITING_SELLER_CONFIRMATION],
      );
      if (rows.length === 0) {
        return false;
      }
      const trade = await this.lockTrade(manager, rows[0].id);
      if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
        return false;
      }

      const existing = await manager.getRepository(TradeDisputeEntity).findOne({
        where: { tradeId: trade.id },
      });
      if (existing) {
        throw TradeDomainException.disputeAlreadyExists();
      }

      const previous = trade.status;
      trade.status = TradeStatus.DISPUTED;
      await manager.getRepository(TradeEntity).save(trade);

      const disputeNumber = await nextOrderNumber(manager, 'TD');
      const now = new Date();
      await manager.getRepository(TradeDisputeEntity).save(
        manager.getRepository(TradeDisputeEntity).create({
          disputeNumber,
          tradeId: trade.id,
          reasonCode: 'SELLER_CONFIRMATION_TIMEOUT',
          status: TradeDisputeStatus.OPEN_UNASSIGNED,
          priority: TradeDisputePriority.NORMAL,
          requestedByUserId: null,
          assignedAdminUserId: null,
          leaderAdminUserId: null,
          resolution: null,
          resolutionReason: null,
          requestedAt: now,
          assignedAt: null,
          resolvedAt: null,
        }),
      );

      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.SELLER_CONFIRMATION_TIMED_OUT,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
      });
      await this.appendEvent(manager, {
        trade,
        previousStatus: TradeStatus.DISPUTED,
        newStatus: TradeStatus.DISPUTED,
        eventCode: TradeEventCode.DISPUTE_OPENED,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
        metadata: { reasonCode: 'SELLER_CONFIRMATION_TIMEOUT' },
      });
      return true;
    });
  }

  private async recoverOneStuckTransfer(): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `
        SELECT id
        FROM trades
        WHERE status = $1
          AND coin_transfer_started_at IS NOT NULL
          AND coin_transfer_started_at <= NOW() - ($2 * INTERVAL '1 millisecond')
        ORDER BY coin_transfer_started_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `,
        [TradeStatus.COIN_TRANSFERRING, TRANSFER_RECOVERY_MIN_AGE_MS],
      );
      if (rows.length === 0) {
        return false;
      }
      await this.transferTradeCoinInTransaction(manager, rows[0].id);
      return true;
    });
  }

  private async markUnpaidInTransaction(
    tradeId: string,
    input: {
      actorType: TradeEventActorType;
      actorUserId: string;
      requireSeller: boolean;
      reason?: string;
      adminAudit?: { ipAddress: string | null };
    },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (input.requireSeller) {
        if (trade.sellerUserId !== input.actorUserId) {
          if (trade.buyerUserId === input.actorUserId) {
            throw TradeDomainException.onlySellerCanMarkUnpaid();
          }
          throw TradeDomainException.accessDenied();
        }
      }
      if (trade.status === TradeStatus.CANCELLED) {
        return;
      }
      if (trade.status !== TradeStatus.PAYMENT_TIMEOUT) {
        throw TradeDomainException.invalidStatus();
      }

      const reason = input.reason ?? '미입금 확정';
      const eventCode =
        input.actorType === TradeEventActorType.ADMIN
          ? TradeEventCode.ADMIN_CONFIRMED_NON_PAYMENT
          : TradeEventCode.UNPAID_CONFIRMED;

      let buyOrderMode: 'CANCEL' | 'REMATCH' = 'CANCEL';
      if (input.actorType === TradeEventActorType.ADMIN) {
        const buyOrder = await manager.getRepository(BuyOrderEntity).findOne({
          where: { id: trade.buyOrderId },
          lock: { mode: 'pessimistic_write' },
        });
        const policy = await this.findActiveMatchingPolicy(manager);
        if (buyOrder && buyOrder.rematchCount < policy.maxRematchCount) {
          buyOrderMode = 'REMATCH';
        }
      }

      await this.appendEvent(manager, {
        trade,
        previousStatus: trade.status,
        newStatus: trade.status,
        eventCode,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        metadata: { reason, buyOrderMode },
      });
      await this.finalizeCancelledInTransaction(manager, {
        trade,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        reason,
        buyOrderMode,
      });

      if (input.adminAudit) {
        await this.writeAdminAudit(manager, {
          actorUserId: input.actorUserId,
          actionType: AuditActionType.ADMIN_CONFIRM_NON_PAYMENT,
          targetId: trade.id,
          reason,
          afterData: { tradeId: trade.id, buyOrderMode },
          ipAddress: input.adminAudit.ipAddress,
        });
      }
    });
  }

  private async finalizeCancelledInTransaction(
    manager: EntityManager,
    input: {
      trade: TradeEntity;
      actorType: TradeEventActorType;
      actorUserId: string | null;
      reason: string;
      buyOrderMode: 'CANCEL' | 'REMATCH';
    },
  ): Promise<void> {
    const { trade } = input;
    if (trade.status === TradeStatus.CANCELLED) {
      return;
    }
    if (trade.status === TradeStatus.COMPLETED) {
      throw TradeDomainException.alreadyCompleted();
    }

    const now = new Date();
    const previous = trade.status;
    await this.releaseReservationInTransaction(manager, trade);
    await this.updateBuyOrderOnCancel(manager, trade, input.buyOrderMode, now);

    trade.status = TradeStatus.CANCELLED;
    trade.cancelledAt = now;
    trade.cancellationReason = input.reason;
    await manager.getRepository(TradeEntity).save(trade);
    await this.appendEvent(manager, {
      trade,
      previousStatus: previous,
      newStatus: trade.status,
      eventCode: TradeEventCode.TRADE_CANCELLED,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      metadata: { reason: input.reason, buyOrderMode: input.buyOrderMode },
    });
  }

  private async releaseReservationInTransaction(
    manager: EntityManager,
    trade: TradeEntity,
  ): Promise<void> {
    const sellOrder = await manager.getRepository(SellOrderEntity).findOne({
      where: { id: trade.sellOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!sellOrder) {
      throw TradeDomainException.notFound();
    }

    const tradeLots = await manager.getRepository(TradeCoinLotEntity).find({
      where: { tradeId: trade.id },
      lock: { mode: 'pessimistic_write' },
    });

    if (sellOrder.status === SellOrderStatus.CANCELLED) {
      const allocations = tradeLots.map((lot) => ({
        coinLotId: lot.coinLotId,
        availableToRelease: lot.allocatedAmount,
      }));
      await this.coinService.releaseSellableInTransaction(manager, {
        userId: trade.sellerUserId,
        amount: trade.coinAmount,
        allocations,
        referenceType: TRADE_LEDGER_REFERENCE_TYPE,
        referenceId: trade.id,
        description: `거래 취소 예약 해제 ${trade.tradeNumber}`,
      });
      for (const lot of tradeLots) {
        const sellLot = await manager
          .getRepository(SellOrderCoinLotEntity)
          .findOne({
            where: {
              sellOrderId: trade.sellOrderId,
              coinLotId: lot.coinLotId,
            },
            lock: { mode: 'pessimistic_write' },
          });
        if (sellLot) {
          sellLot.releasedAmount = addAmount(
            sellLot.releasedAmount,
            lot.allocatedAmount,
          );
          await manager.getRepository(SellOrderCoinLotEntity).save(sellLot);
        }
      }
      sellOrder.reservedCoinAmount = subAmount(
        sellOrder.reservedCoinAmount,
        trade.coinAmount,
      );
    } else {
      sellOrder.reservedCoinAmount = subAmount(
        sellOrder.reservedCoinAmount,
        trade.coinAmount,
      );
      sellOrder.remainingCoinAmount = addAmount(
        sellOrder.remainingCoinAmount,
        trade.coinAmount,
      );
      sellOrder.status = deriveSellOrderStatus(
        BigInt(sellOrder.remainingCoinAmount),
        BigInt(sellOrder.reservedCoinAmount),
      );
    }

    await manager.getRepository(SellOrderEntity).save(sellOrder);

    for (const lot of tradeLots) {
      lot.returnedAmount = lot.allocatedAmount;
      await manager.getRepository(TradeCoinLotEntity).save(lot);
    }
  }

  private async updateBuyOrderOnCancel(
    manager: EntityManager,
    trade: TradeEntity,
    mode: 'CANCEL' | 'REMATCH',
    now: Date,
  ): Promise<void> {
    const buyOrder = await manager.getRepository(BuyOrderEntity).findOne({
      where: { id: trade.buyOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!buyOrder) {
      return;
    }
    if (mode === 'REMATCH') {
      buyOrder.status = BuyOrderStatus.MATCHING;
      buyOrder.nextMatchableAt = now;
      buyOrder.matchedAt = null;
      buyOrder.cancelledAt = null;
    } else {
      buyOrder.status = BuyOrderStatus.CANCELLED;
      buyOrder.cancelledAt = now;
      buyOrder.nextMatchableAt = null;
    }
    await manager.getRepository(BuyOrderEntity).save(buyOrder);
  }

  private async lockTrade(
    manager: EntityManager,
    tradeId: string,
  ): Promise<TradeEntity> {
    const trade = await manager.getRepository(TradeEntity).findOne({
      where: { id: tradeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!trade) {
      throw TradeDomainException.notFound();
    }
    return trade;
  }

  private assertParty(
    trade: TradeEntity,
    userId: string,
    role: PartyRole,
  ): void {
    const isBuyer = trade.buyerUserId === userId;
    const isSeller = trade.sellerUserId === userId;
    if (role === 'BUYER') {
      if (!isBuyer) {
        if (isSeller) {
          throw TradeDomainException.onlyBuyerCanReportPayment();
        }
        throw TradeDomainException.accessDenied();
      }
      return;
    }
    if (role === 'SELLER') {
      if (!isSeller) {
        if (isBuyer) {
          throw TradeDomainException.onlySellerCanConfirmPayment();
        }
        throw TradeDomainException.accessDenied();
      }
      return;
    }
    if (!isBuyer && !isSeller) {
      throw TradeDomainException.accessDenied();
    }
  }

  private assertWaitingSellerConfirmation(trade: TradeEntity): void {
    if (trade.status === TradeStatus.COMPLETED) {
      throw TradeDomainException.alreadyCompleted();
    }
    if (trade.status === TradeStatus.CANCELLED) {
      throw TradeDomainException.alreadyCancelled();
    }
    if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
      throw TradeDomainException.invalidStatus();
    }
  }

  private actorTypeOf(
    trade: TradeEntity,
    userId: string,
  ): TradeEventActorType {
    if (trade.buyerUserId === userId) {
      return TradeEventActorType.BUYER;
    }
    if (trade.sellerUserId === userId) {
      return TradeEventActorType.SELLER;
    }
    return TradeEventActorType.ADMIN;
  }

  private async appendEvent(
    manager: EntityManager,
    input: {
      trade: TradeEntity;
      previousStatus: TradeStatus | null;
      newStatus: TradeStatus | null;
      eventCode: TradeEventCode;
      actorType: TradeEventActorType;
      actorUserId: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const eventRepository = manager.getRepository(TradeEventEntity);
    await eventRepository.save(
      eventRepository.create({
        tradeId: input.trade.id,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        eventCode: input.eventCode,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        message: null,
        metadata: input.metadata ?? null,
      }),
    );
  }

  private async loadEvents(tradeId: string): Promise<TradeEventEntity[]> {
    return this.tradeEventRepository.find({
      where: { tradeId },
      order: { createdAt: 'ASC' },
    });
  }

  private async findEvent(
    manager: EntityManager,
    tradeId: string,
    eventCode: TradeEventCode,
  ): Promise<TradeEventEntity | null> {
    const rows = await manager.getRepository(TradeEventEntity).find({
      where: { tradeId, eventCode },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  private computeActions(
    trade: TradeEntity,
    role: TradeViewerRole,
    events: TradeEventEntity[],
  ): TradeActionsDto {
    const codes = new Set(events.map((event) => event.eventCode));
    const requestedBy = events.find(
      (event) => event.eventCode === TradeEventCode.CANCELLATION_REQUESTED,
    )?.actorUserId;
    const isBuyer = role === TradeViewerRole.BUYER;
    const isSeller = role === TradeViewerRole.SELLER;
    const waitingSeller =
      trade.status === TradeStatus.WAITING_SELLER_CONFIRMATION;
    const requested = codes.has(TradeEventCode.CANCELLATION_REQUESTED);
    const agreed = codes.has(TradeEventCode.CANCELLATION_AGREED);
    const refundReported = codes.has(TradeEventCode.REFUND_REPORTED);

    return {
      canReportPayment:
        isBuyer &&
        (trade.status === TradeStatus.WAITING_BUYER_PAYMENT ||
          trade.status === TradeStatus.PAYMENT_TIMEOUT),
      canConfirmPayment: isSeller && waitingSeller,
      canCancel:
        trade.status === TradeStatus.WAITING_BUYER_PAYMENT &&
        trade.buyerReportedPaidAt === null,
      canRequestCancellation: waitingSeller && !requested,
      canAgreeCancellation:
        waitingSeller &&
        requested &&
        !agreed &&
        requestedBy !== undefined &&
        ((isBuyer && requestedBy === trade.sellerUserId) ||
          (isSeller && requestedBy === trade.buyerUserId)),
      canReportRefund: isSeller && waitingSeller && agreed && !refundReported,
      canConfirmRefund:
        isBuyer &&
        waitingSeller &&
        refundReported &&
        !codes.has(TradeEventCode.REFUND_CONFIRMED),
      canMarkUnpaid: isSeller && trade.status === TradeStatus.PAYMENT_TIMEOUT,
      canOpenDispute: false,
    };
  }

  private toListItem(trade: TradeEntity, userId: string): TradeListItemDto {
    return {
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      role:
        trade.buyerUserId === userId
          ? TradeViewerRole.BUYER
          : TradeViewerRole.SELLER,
      status: trade.status,
      coinAmount: trade.coinAmount,
      createdAt: trade.createdAt,
    };
  }

  private async toUserResponse(
    trade: TradeEntity,
    userId: string,
    events: TradeEventEntity[],
    flags: ExtraFlags,
  ): Promise<TradeResponseDto> {
    const role =
      trade.buyerUserId === userId
        ? TradeViewerRole.BUYER
        : TradeViewerRole.SELLER;
    const counterpartId =
      role === TradeViewerRole.BUYER ? trade.sellerUserId : trade.buyerUserId;
    const nickname = await this.userService.getNicknameByUserId(counterpartId);
    const bankName = await this.resolveBankName(trade.sellerBankCode);

    return {
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      role,
      status: trade.status,
      coinAmount: trade.coinAmount,
      paymentAmount: trade.paymentAmount,
      payment:
        role === TradeViewerRole.BUYER
          ? {
              bankName,
              accountNumber: trade.sellerAccountNumber,
              accountHolderName: trade.sellerAccountHolderName,
              dueAt: trade.buyerPaymentDueAt,
            }
          : null,
      counterparty: { nickname: maskNickname(nickname) },
      actions: this.computeActions(trade, role, events),
      buyerPaymentDueAt: trade.buyerPaymentDueAt,
      sellerConfirmationDueAt: trade.sellerConfirmationDueAt,
      createdAt: trade.createdAt,
      ...flags,
    };
  }

  private async resolveBankName(bankCode: string): Promise<string> {
    const bank = await this.banksService.findByCode(bankCode);
    return bank?.name ?? bankCode;
  }

  private createAdminTradeListQueryBuilder(): SelectQueryBuilder<TradeEntity> {
    return this.tradeRepository.createQueryBuilder('trade');
  }

  private applyAdminTradeListFilters(
    qb: SelectQueryBuilder<TradeEntity>,
    query: SearchAdminTradesDto,
  ): void {
    if (query.status) {
      qb.andWhere('trade.status = :status', { status: query.status });
    }
    if (query.buyerUserId) {
      qb.andWhere('trade.buyer_user_id = :buyerUserId', {
        buyerUserId: query.buyerUserId,
      });
    }
    if (query.sellerUserId) {
      qb.andWhere('trade.seller_user_id = :sellerUserId', {
        sellerUserId: query.sellerUserId,
      });
    }
    if (query.createdFrom) {
      qb.andWhere('trade.created_at >= :createdFrom', {
        createdFrom: query.createdFrom,
      });
    }
    if (query.createdTo) {
      qb.andWhere('trade.created_at <= :createdTo', {
        createdTo: query.createdTo,
      });
    }
    if (query.isTimedOut) {
      this.applyAdminTradeTimeoutFilter(qb);
    }
    if (query.keyword?.trim()) {
      this.applyAdminTradeKeywordFilter(qb, query.keyword.trim());
    }
  }

  private applyAdminTradeTimeoutFilter(
    qb: SelectQueryBuilder<TradeEntity>,
  ): void {
    qb.andWhere(
      `(
        trade.status = :paymentTimeout
        OR (trade.status = :waitingPayment AND trade.buyer_payment_due_at <= NOW())
        OR (trade.status = :waitingSeller AND trade.seller_confirmation_due_at <= NOW())
      )`,
      {
        paymentTimeout: TradeStatus.PAYMENT_TIMEOUT,
        waitingPayment: TradeStatus.WAITING_BUYER_PAYMENT,
        waitingSeller: TradeStatus.WAITING_SELLER_CONFIRMATION,
      },
    );
  }

  private applyAdminTradeKeywordFilter(
    qb: SelectQueryBuilder<TradeEntity>,
    keyword: string,
  ): void {
    qb.leftJoin(BuyOrderEntity, 'buy_order', 'buy_order.id = trade.buy_order_id')
      .leftJoin(
        SellOrderEntity,
        'sell_order',
        'sell_order.id = trade.sell_order_id',
      )
      .leftJoin(UserEntity, 'buyer_user', 'buyer_user.id = trade.buyer_user_id')
      .leftJoin(
        UserProfileEntity,
        'buyer_profile',
        'buyer_profile.user_id = trade.buyer_user_id',
      )
      .leftJoin(
        UserEntity,
        'seller_user',
        'seller_user.id = trade.seller_user_id',
      )
      .leftJoin(
        UserProfileEntity,
        'seller_profile',
        'seller_profile.user_id = trade.seller_user_id',
      )
      .andWhere(
        `(
          trade.trade_number ILIKE :like
          OR buy_order.order_number ILIKE :like
          OR sell_order.order_number ILIKE :like
          OR buyer_user.login_id ILIKE :like
          OR buyer_profile.name ILIKE :like
          OR seller_user.login_id ILIKE :like
          OR seller_profile.name ILIKE :like
        )`,
        { like: `%${keyword}%` },
      );
  }

  private toAdminTradeListItem(
    row: TradeEntity,
    parties: Map<string, AdminPartySummary>,
  ): AdminTradeListItemDto {
    return {
      id: row.id,
      tradeNumber: row.tradeNumber,
      buyer: this.userService.toAdminPartyDto(parties.get(row.buyerUserId)),
      seller: this.userService.toAdminPartyDto(parties.get(row.sellerUserId)),
      coinAmount: row.coinAmount,
      paymentAmount: row.paymentAmount,
      status: row.status,
      buyerPaymentDueAt: row.buyerPaymentDueAt,
      sellerConfirmationDueAt: row.sellerConfirmationDueAt,
      buyerReportedPaidAt: row.buyerReportedPaidAt,
      createdAt: row.createdAt,
    };
  }

  private toAdminTradeEvent(event: TradeEventEntity): AdminTradeEventDto {
    return {
      eventCode: event.eventCode,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      actorType: event.actorType,
      actorUserId: event.actorUserId,
      message: event.message,
      metadata: event.metadata,
      createdAt: event.createdAt,
    };
  }

  private async assertAdminTradeExists(tradeId: string): Promise<void> {
    const exists = await this.tradeRepository.exist({ where: { id: tradeId } });
    if (!exists) {
      throw TradeDomainException.notFound();
    }
  }

  private async findActiveMatchingPolicy(
    manager: EntityManager,
  ): Promise<MatchingPolicyEntity> {
    const policy = await manager.getRepository(MatchingPolicyEntity).findOne({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC' },
    });
    if (!policy) {
      throw TradeDomainException.invalidStatus();
    }
    return policy;
  }

  private async writeAdminAudit(
    manager: EntityManager,
    input: {
      actorUserId: string;
      actionType: AuditActionType;
      targetId: string;
      reason: string;
      afterData: Record<string, unknown>;
      ipAddress: string | null;
    },
  ): Promise<void> {
    await manager.getRepository(AuditLogEntity).save(
      manager.getRepository(AuditLogEntity).create({
        actorUserId: input.actorUserId,
        actionType: input.actionType,
        targetType: AuditTargetType.TRADE,
        targetId: input.targetId,
        beforeData: null,
        afterData: input.afterData,
        reason: input.reason,
        ipAddress: input.ipAddress,
      }),
    );
  }
}
