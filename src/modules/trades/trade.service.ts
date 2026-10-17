import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
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
  OPEN_DISPUTE_STATUSES,
  TRADE_LEDGER_REFERENCE_TYPE,
  TRADE_TIMEOUT_BATCH_SIZE,
  TRANSFER_RECOVERY_MIN_AGE_MS,
  DISPUTE_SYSTEM_MESSAGE_CLOSED,
  DISPUTE_SYSTEM_MESSAGE_JOINED,
  DISPUTE_TEAM_DISPLAY_NAME,
  PAYMENT_REPORT_WITHDRAW_WINDOW_MS,
} from './domain/constants/trade.constants';
import { TradeDisputeActionType } from './domain/enums/trade-dispute-action-type.enum';
import { TradeDisputePriority } from './domain/enums/trade-dispute-priority.enum';
import { TradeDisputeReasonCode } from './domain/enums/trade-dispute-reason-code.enum';
import { TradeDisputeResolution } from './domain/enums/trade-dispute-resolution.enum';
import { TradeDisputeStatus } from './domain/enums/trade-dispute-status.enum';
import { TradeEventActorType } from './domain/enums/trade-event-actor-type.enum';
import { TradeEventCode } from './domain/enums/trade-event-code.enum';
import { TradeStatus } from './domain/enums/trade-status.enum';
import {
  AdminDisputeDetailDto,
  AdminDisputeListItemDto,
} from './dto/admin-dispute-response.dto';
import {
  AdminTradeCoinLotDto,
  AdminTradeDetailDto,
  AdminTradeDisputeDto,
  AdminTradeEventDto,
  AdminTradeListItemDto,
} from './dto/admin-trade-response.dto';
import {
  AdminOpenDisputeDto,
  AdminResolveDisputeDto,
  AdminTradeReasonDto,
} from './dto/admin-trade-command.dto';
import {
  SearchAdminDisputesDto,
  SearchAdminTradeTimeoutsDto,
  SearchAdminTradesDto,
  SearchMyTradesDto,
} from './dto/search-trades.dto';
import {
  AdminDisputeMessageDto,
  AdminDisputeMessageListDto,
  PartyDisputeDetailDto,
  PartyDisputeMessageDto,
  PartyDisputeMessageListDto,
  SearchDisputeMessagesDto,
} from './dto/dispute-message.dto';
import {
  TradeActionsDto,
  TradeListItemDto,
  TradeResponseDto,
  TradeViewerRole,
} from './dto/trade-response.dto';
import { TradeDomainException } from './exceptions/trade.exceptions';
import { TradeCoinLotEntity } from './infrastructure/entities/trade-coin-lot.entity';
import { TradeDisputeActionEntity } from './infrastructure/entities/trade-dispute-action.entity';
import { TradeDisputeEntity } from './infrastructure/entities/trade-dispute.entity';
import { TradeEventEntity } from './infrastructure/entities/trade-event.entity';
import { TradeEntity } from './infrastructure/entities/trade.entity';
import { DisputeRealtimePublisher } from './realtime/dispute-realtime.publisher';
import { TradeRealtimePublisher } from './realtime/trade-realtime.publisher';
import { DisputeEvidenceStorage } from './dispute-evidence.storage';
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
  alreadyDisputed?: boolean;
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
    private readonly disputeRealtime: DisputeRealtimePublisher,
    private readonly tradeRealtime: TradeRealtimePublisher,
    private readonly disputeEvidenceStorage: DisputeEvidenceStorage,
    @InjectRepository(TradeEntity)
    private readonly tradeRepository: Repository<TradeEntity>,
    @InjectRepository(TradeEventEntity)
    private readonly tradeEventRepository: Repository<TradeEventEntity>,
    @InjectRepository(TradeCoinLotEntity)
    private readonly tradeCoinLotRepository: Repository<TradeCoinLotEntity>,
    @InjectRepository(TradeDisputeEntity)
    private readonly tradeDisputeRepository: Repository<TradeDisputeEntity>,
    @InjectRepository(TradeDisputeActionEntity)
    private readonly tradeDisputeActionRepository: Repository<TradeDisputeActionEntity>,
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

    const disputesByTradeId = await this.loadDisputesByTradeIds(
      rows
        .filter((row) => row.status === TradeStatus.DISPUTED)
        .map((row) => row.id),
    );

    return {
      items: rows.map((row) =>
        this.toListItem(row, userId, disputesByTradeId.get(row.id) ?? null),
      ),
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

    this.publishTradeUpdated(tradeId);
    return this.getMyTrade(userId, tradeId, { alreadyReported });
  }

  async withdrawPaymentReport(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      this.assertParty(trade, userId, 'BUYER');

      if (trade.status === TradeStatus.WAITING_BUYER_PAYMENT) {
        return;
      }
      if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
        throw TradeDomainException.invalidStatus();
      }
      if (trade.buyerReportedPaidAt == null) {
        throw TradeDomainException.invalidStatus();
      }
      const elapsed =
        Date.now() - trade.buyerReportedPaidAt.getTime();
      if (elapsed > PAYMENT_REPORT_WITHDRAW_WINDOW_MS) {
        throw TradeDomainException.withdrawWindowExpired();
      }

      const previous = trade.status;
      const now = new Date();
      trade.status = TradeStatus.WAITING_BUYER_PAYMENT;
      trade.buyerReportedPaidAt = null;
      trade.sellerConfirmationDueAt = null;
      trade.buyerPaymentDueAt = new Date(
        now.getTime() + trade.buyerPaymentTimeoutSeconds * 1000,
      );
      await manager.getRepository(TradeEntity).save(trade);
      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.BUYER_WITHDREW_PAYMENT_REPORT,
        actorType: TradeEventActorType.BUYER,
        actorUserId: userId,
      });
      await this.notificationService.enqueueTradePushInTransaction(manager, {
        eventType: NotificationEventType.TRADE_PAYMENT_REPORT_WITHDRAWN,
        actorUserId: userId,
        referenceType: NotificationReferenceType.TRADE,
        referenceId: trade.id,
        deepLink: `/trade?tradeId=${trade.id}`,
        recipientUserId: trade.sellerUserId,
        recipientRole: 'SELLER',
        tradeId: trade.id,
      });
    });

    this.publishTradeUpdated(tradeId);
    return this.getMyTrade(userId, tradeId);
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

    this.publishTradeUpdated(tradeId);
    return this.getMyTrade(userId, tradeId, { alreadyConfirmed });
  }

  async denyPayment(
    userId: string,
    tradeId: string,
  ): Promise<TradeResponseDto> {
    let alreadyDisputed = false;
    let opened: TradeDisputeEntity | null = null;
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (trade.sellerUserId !== userId) {
        if (trade.buyerUserId === userId) {
          throw TradeDomainException.onlySellerCanDenyPayment();
        }
        throw TradeDomainException.accessDenied();
      }
      if (trade.status === TradeStatus.DISPUTED) {
        alreadyDisputed = true;
        return;
      }
      if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
        throw TradeDomainException.invalidStatus();
      }
      opened = await this.createDisputeInTransaction(manager, {
        trade,
        reasonCode: TradeDisputeReasonCode.NOT_RECEIVED,
        requestedByUserId: userId,
        actorType: TradeEventActorType.SELLER,
        actorUserId: userId,
        openEventCode: TradeEventCode.SELLER_DENIED_PAYMENT,
        resolutionReason: null,
      });
    });
    this.publishDisputeOpenedIfPresent(opened);
    this.publishTradeUpdated(tradeId);
    return this.getMyTrade(userId, tradeId, { alreadyDisputed });
  }

  async openPartyDispute(
    userId: string,
    tradeId: string,
    reason?: string,
  ): Promise<TradeResponseDto> {
    let alreadyDisputed = false;
    let opened: TradeDisputeEntity | null = null;
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (trade.buyerUserId !== userId) {
        if (trade.sellerUserId === userId) {
          throw TradeDomainException.onlyBuyerCanOpenDispute();
        }
        throw TradeDomainException.accessDenied();
      }
      if (trade.status === TradeStatus.DISPUTED) {
        alreadyDisputed = true;
        return;
      }
      if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
        throw TradeDomainException.invalidStatus();
      }
      opened = await this.createDisputeInTransaction(manager, {
        trade,
        reasonCode: TradeDisputeReasonCode.SELLER_NO_CONFIRM,
        requestedByUserId: userId,
        actorType: TradeEventActorType.BUYER,
        actorUserId: userId,
        openEventCode: TradeEventCode.BUYER_OPENED_DISPUTE,
        resolutionReason: reason ?? null,
      });
    });
    this.publishDisputeOpenedIfPresent(opened);
    this.publishTradeUpdated(tradeId);
    return this.getMyTrade(userId, tradeId, { alreadyDisputed });
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

    this.publishTradeUpdated(tradeId);
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
    this.publishTradeUpdated(tradeId);
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
    this.publishTradeUpdated(tradeId);
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
    this.publishTradeUpdated(tradeId);
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
    this.publishTradeUpdated(tradeId);
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
    this.publishTradeUpdated(tradeId);
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
    let opened: TradeDisputeEntity | null = null;
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

      opened = await this.createDisputeInTransaction(manager, {
        trade,
        reasonCode: dto.reasonCode,
        requestedByUserId: null,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        openEventCode: TradeEventCode.ADMIN_OPENED_DISPUTE,
        resolutionReason: dto.reason,
        metadata: { reasonCode: dto.reasonCode, reason: dto.reason },
      });
      await this.writeAdminAudit(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_OPEN_TRADE_DISPUTE,
        targetId: trade.id,
        reason: dto.reason,
        afterData: {
          tradeId: trade.id,
          status: TradeStatus.DISPUTED,
          reasonCode: dto.reasonCode,
        },
        ipAddress,
      });
    });
    this.publishDisputeOpenedIfPresent(opened);
    this.publishTradeUpdated(tradeId);
    return this.getAdminTrade(tradeId);
  }

  async resolveDispute(
    adminUserId: string,
    tradeId: string,
    dto: AdminResolveDisputeDto,
    ipAddress: string | null = null,
  ): Promise<AdminTradeDetailDto> {
    if (dto.resolution === TradeDisputeResolution.FORCE_COMPLETE) {
      await this.resolveDisputeForceComplete(
        adminUserId,
        tradeId,
        dto.reason,
        ipAddress,
      );
    } else if (dto.resolution === TradeDisputeResolution.FORCE_CANCEL) {
      await this.resolveDisputeForceCancel(
        adminUserId,
        tradeId,
        dto.reason,
        ipAddress,
      );
    } else {
      await this.resolveDisputeResume(
        adminUserId,
        tradeId,
        dto.reason,
        ipAddress,
      );
    }
    await this.publishDisputeResolvedForTrade(tradeId);
    this.publishTradeUpdated(tradeId);
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

  async listAdminDisputes(
    query: SearchAdminDisputesDto,
    actorUserId: string,
  ): Promise<{ items: AdminDisputeListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.tradeDisputeRepository
      .createQueryBuilder('dispute')
      .innerJoinAndSelect('dispute.trade', 'trade');
    this.applyAdminDisputeListFilters(qb, query, actorUserId);

    const [rows, totalItems] = await qb
      .orderBy('dispute.requestedAt', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const parties = await this.userService.getAdminPartySummaries(
      rows.flatMap((row) => [row.trade.buyerUserId, row.trade.sellerUserId]),
    );

    return {
      items: rows.map((row) => this.toAdminDisputeListItem(row, parties)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getAdminDispute(disputeId: string): Promise<AdminDisputeDetailDto> {
    const dispute = await this.tradeDisputeRepository.findOne({
      where: { id: disputeId },
      relations: { trade: true },
    });
    if (!dispute) {
      throw TradeDomainException.disputeNotFound();
    }
    return this.toAdminDisputeDetail(dispute);
  }

  async assignDispute(
    actorUserId: string,
    disputeId: string,
    assigneeUserId: string,
    ipAddress: string | null = null,
  ): Promise<AdminDisputeDetailDto> {
    let systemAction: TradeDisputeActionEntity | null = null;
    await this.dataSource.transaction(async (manager) => {
      const dispute = await this.lockDispute(manager, disputeId);
      this.assertDisputeNotTerminal(dispute);
      if (dispute.status !== TradeDisputeStatus.OPEN_UNASSIGNED) {
        throw TradeDomainException.disputeAlreadyAssigned();
      }
      systemAction = await this.applyDisputeAssignmentInTransaction(manager, {
        dispute,
        actorUserId,
        assigneeUserId,
        reason: '분쟁 배정',
        ipAddress,
      });
    });
    await this.publishAssignmentRealtime(disputeId, systemAction);
    return this.getAdminDispute(disputeId);
  }

  async takeoverDispute(
    actorUserId: string,
    disputeId: string,
    ipAddress: string | null = null,
  ): Promise<AdminDisputeDetailDto> {
    let systemAction: TradeDisputeActionEntity | null = null;
    let skipped = false;
    await this.dataSource.transaction(async (manager) => {
      const dispute = await this.lockDispute(manager, disputeId);
      this.assertDisputeNotTerminal(dispute);
      if (dispute.assignedAdminUserId === actorUserId) {
        skipped = true;
        return;
      }
      systemAction = await this.applyDisputeAssignmentInTransaction(manager, {
        dispute,
        actorUserId,
        assigneeUserId: actorUserId,
        reason: '분쟁 인수',
        ipAddress,
      });
    });
    if (!skipped) {
      await this.publishAssignmentRealtime(disputeId, systemAction);
    }
    return this.getAdminDispute(disputeId);
  }

  async getMyDispute(
    userId: string,
    disputeId: string,
  ): Promise<PartyDisputeDetailDto> {
    const dispute = await this.loadDisputeWithTrade(disputeId);
    this.assertParty(dispute.trade, userId, 'PARTY');
    return this.toPartyDisputeDetail(dispute);
  }

  async listPartyDisputeMessages(
    userId: string,
    disputeId: string,
    query: SearchDisputeMessagesDto,
  ): Promise<PartyDisputeMessageListDto> {
    const dispute = await this.loadDisputeWithTrade(disputeId);
    this.assertParty(dispute.trade, userId, 'PARTY');
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const [rows, totalItems] =
      await this.tradeDisputeActionRepository.findAndCount({
        where: { disputeId, isInternal: false },
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (page - 1) * size,
        take: size,
      });
    const nickname = await this.userService.getNicknameByUserId(
      this.counterpartUserId(dispute.trade, userId),
    );
    return {
      items: rows.map((row) =>
        this.toPartyDisputeMessage(row, dispute.trade, userId, nickname),
      ),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async postPartyDisputeMessage(
    userId: string,
    disputeId: string,
    body: string,
  ): Promise<PartyDisputeMessageDto> {
    let saved!: TradeDisputeActionEntity;
    await this.dataSource.transaction(async (manager) => {
      const dispute = await this.lockDispute(manager, disputeId);
      const trade = await this.lockTrade(manager, dispute.tradeId);
      this.assertParty(trade, userId, 'PARTY');
      this.assertDisputeWritable(dispute);
      saved = await this.insertDisputeActionInTransaction(manager, {
        disputeId: dispute.id,
        actionType: TradeDisputeActionType.MESSAGE,
        actorUserId: userId,
        isInternal: false,
        message: body.trim(),
      });
    });
    const dispute = await this.loadDisputeWithTrade(disputeId);
    const nickname = await this.userService.getNicknameByUserId(
      this.counterpartUserId(dispute.trade, userId),
    );
    void this.disputeRealtime.publishMessageCreated({
      disputeId,
      message: this.toAdminDisputeMessage(saved, dispute.trade),
    });
    return this.toPartyDisputeMessage(
      saved,
      dispute.trade,
      userId,
      nickname,
    );
  }

  async listAdminDisputeMessages(
    disputeId: string,
    query: SearchDisputeMessagesDto,
  ): Promise<AdminDisputeMessageListDto> {
    const dispute = await this.loadDisputeWithTrade(disputeId);
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const [rows, totalItems] =
      await this.tradeDisputeActionRepository.findAndCount({
        where: { disputeId },
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (page - 1) * size,
        take: size,
      });
    return {
      items: rows.map((row) =>
        this.toAdminDisputeMessage(row, dispute.trade),
      ),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async postAdminDisputeMessage(
    adminUserId: string,
    disputeId: string,
    body: string,
    isInternal: boolean,
  ): Promise<AdminDisputeMessageDto> {
    let saved!: TradeDisputeActionEntity;
    await this.dataSource.transaction(async (manager) => {
      const dispute = await this.lockDispute(manager, disputeId);
      this.assertDisputeWritable(dispute);
      if (!isInternal && dispute.assignedAdminUserId == null) {
        throw TradeDomainException.disputeNotAssigned();
      }
      if (
        !isInternal &&
        dispute.status === TradeDisputeStatus.ASSIGNED
      ) {
        dispute.status = TradeDisputeStatus.IN_REVIEW;
        await manager.getRepository(TradeDisputeEntity).save(dispute);
      }
      saved = await this.insertDisputeActionInTransaction(manager, {
        disputeId: dispute.id,
        actionType: isInternal
          ? TradeDisputeActionType.INTERNAL_NOTE
          : TradeDisputeActionType.MESSAGE,
        actorUserId: adminUserId,
        isInternal,
        message: body.trim(),
      });
    });
    const dispute = await this.loadDisputeWithTrade(disputeId);
    const message = this.toAdminDisputeMessage(saved, dispute.trade);
    void this.disputeRealtime.publishMessageCreated({
      disputeId,
      message,
    });
    if (!isInternal && dispute.status === TradeDisputeStatus.IN_REVIEW) {
      this.disputeRealtime.publishDisputeUpdated({
        disputeId,
        tradeId: dispute.tradeId,
        status: dispute.status,
      });
    }
    return message;
  }

  async postPartyDisputeEvidence(
    userId: string,
    disputeId: string,
    file: Express.Multer.File,
  ): Promise<PartyDisputeMessageDto> {
    const stored = await this.disputeEvidenceStorage.saveDisputeImage(
      disputeId,
      file,
    );
    let saved!: TradeDisputeActionEntity;
    await this.dataSource.transaction(async (manager) => {
      const dispute = await this.lockDispute(manager, disputeId);
      const trade = await this.lockTrade(manager, dispute.tradeId);
      this.assertParty(trade, userId, 'PARTY');
      this.assertDisputeWritable(dispute);
      saved = await this.insertDisputeActionInTransaction(manager, {
        disputeId: dispute.id,
        actionType: TradeDisputeActionType.EVIDENCE,
        actorUserId: userId,
        isInternal: false,
        message: '이미지를 첨부했어요.',
        metadata: {
          url: stored.url,
          mimeType: stored.mimeType,
          originalName: stored.originalName,
        },
      });
    });
    const dispute = await this.loadDisputeWithTrade(disputeId);
    const nickname = await this.userService.getNicknameByUserId(
      this.counterpartUserId(dispute.trade, userId),
    );
    void this.disputeRealtime.publishMessageCreated({
      disputeId,
      message: this.toAdminDisputeMessage(saved, dispute.trade),
    });
    return this.toPartyDisputeMessage(
      saved,
      dispute.trade,
      userId,
      nickname,
    );
  }

  async postAdminDisputeEvidence(
    adminUserId: string,
    disputeId: string,
    file: Express.Multer.File,
  ): Promise<AdminDisputeMessageDto> {
    const stored = await this.disputeEvidenceStorage.saveDisputeImage(
      disputeId,
      file,
    );
    let saved!: TradeDisputeActionEntity;
    await this.dataSource.transaction(async (manager) => {
      const dispute = await this.lockDispute(manager, disputeId);
      this.assertDisputeWritable(dispute);
      if (dispute.assignedAdminUserId == null) {
        throw TradeDomainException.disputeNotAssigned();
      }
      if (dispute.status === TradeDisputeStatus.ASSIGNED) {
        dispute.status = TradeDisputeStatus.IN_REVIEW;
        await manager.getRepository(TradeDisputeEntity).save(dispute);
      }
      saved = await this.insertDisputeActionInTransaction(manager, {
        disputeId: dispute.id,
        actionType: TradeDisputeActionType.EVIDENCE,
        actorUserId: adminUserId,
        isInternal: false,
        message: '이미지를 첨부했어요.',
        metadata: {
          url: stored.url,
          mimeType: stored.mimeType,
          originalName: stored.originalName,
        },
      });
    });
    const dispute = await this.loadDisputeWithTrade(disputeId);
    const message = this.toAdminDisputeMessage(saved, dispute.trade);
    void this.disputeRealtime.publishMessageCreated({
      disputeId,
      message,
    });
    return message;
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
      dispute: dispute ? this.toAdminTradeDispute(dispute) : null,
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
    const dispute = await manager.getRepository(TradeDisputeEntity).findOne({
      where: { tradeId: trade.id },
    });
    if (dispute && dispute.status !== TradeDisputeStatus.RESOLVED) {
      await this.insertSystemDisputeMessageInTransaction(manager, {
        disputeId: dispute.id,
        kind: 'RESOLVED',
        message: DISPUTE_SYSTEM_MESSAGE_CLOSED,
      });
      dispute.status = TradeDisputeStatus.RESOLVED;
      dispute.resolution = TradeDisputeResolution.FORCE_COMPLETE;
      dispute.resolvedAt = now;
      await manager.getRepository(TradeDisputeEntity).save(dispute);
      await this.enqueueTradePartyPushInTransaction(manager, {
        eventType: NotificationEventType.DISPUTE_RESOLVED,
        actorUserId: null,
        trade,
        deepLink: completedDeepLink,
      });
    }
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
    const tradeId = await this.dataSource.transaction(async (manager) => {
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
        return null;
      }
      const trade = await this.lockTrade(manager, rows[0].id);
      if (trade.status !== TradeStatus.WAITING_BUYER_PAYMENT) {
        return null;
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
      await this.enqueueTradePartyPushInTransaction(manager, {
        eventType: NotificationEventType.TRADE_EXPIRED,
        actorUserId: null,
        trade,
      });
      return trade.id;
    });
    if (!tradeId) return false;
    this.publishTradeUpdated(tradeId);
    return true;
  }

  private async expireOneSellerConfirmation(): Promise<boolean> {
    const openedRef: { value: TradeDisputeEntity | null } = { value: null };
    const didExpire = await this.dataSource.transaction(async (manager) => {
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
        return null;
      }
      const trade = await this.lockTrade(manager, rows[0].id);
      if (trade.status !== TradeStatus.WAITING_SELLER_CONFIRMATION) {
        return null;
      }

      openedRef.value = await this.createDisputeInTransaction(manager, {
        trade,
        reasonCode: TradeDisputeReasonCode.SELLER_CONFIRMATION_TIMEOUT,
        requestedByUserId: null,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
        openEventCode: TradeEventCode.SELLER_CONFIRMATION_TIMED_OUT,
        resolutionReason: null,
        alsoAppendDisputeOpened: true,
      });
      return trade.id;
    });
    if (!didExpire) return false;
    this.publishDisputeOpenedIfPresent(openedRef.value);
    this.publishTradeUpdated(didExpire);
    return true;
  }

  private async recoverOneStuckTransfer(): Promise<boolean> {
    const tradeId = await this.dataSource.transaction(async (manager) => {
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
        return null;
      }
      await this.transferTradeCoinInTransaction(manager, rows[0].id);
      return rows[0].id;
    });
    if (!tradeId) return false;
    this.publishTradeUpdated(tradeId);
    return true;
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
    await this.enqueueTradePartyPushInTransaction(manager, {
      eventType: NotificationEventType.TRADE_CANCELLED,
      actorUserId: input.actorUserId,
      trade,
    });
  }

  private async enqueueTradePartyPushInTransaction(
    manager: EntityManager,
    input: {
      eventType: NotificationEventType;
      actorUserId: string | null;
      trade: TradeEntity;
      deepLink?: string;
    },
  ): Promise<void> {
    const deepLink = input.deepLink ?? `/trade?tradeId=${input.trade.id}`;
    const base = {
      actorUserId: input.actorUserId,
      referenceType: NotificationReferenceType.TRADE,
      referenceId: input.trade.id,
      deepLink,
      tradeId: input.trade.id,
      buyOrderId: input.trade.buyOrderId,
    };
    await this.notificationService.enqueueTradePushInTransaction(manager, {
      ...base,
      eventType: input.eventType,
      recipientUserId: input.trade.buyerUserId,
      recipientRole: 'BUYER',
    });
    await this.notificationService.enqueueTradePushInTransaction(manager, {
      ...base,
      eventType: input.eventType,
      recipientUserId: input.trade.sellerUserId,
      recipientRole: 'SELLER',
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

  private async createDisputeInTransaction(
    manager: EntityManager,
    input: {
      trade: TradeEntity;
      reasonCode: TradeDisputeReasonCode;
      requestedByUserId: string | null;
      actorType: TradeEventActorType;
      actorUserId: string | null;
      openEventCode: TradeEventCode;
      resolutionReason: string | null;
      metadata?: Record<string, unknown>;
      alsoAppendDisputeOpened?: boolean;
    },
  ): Promise<TradeDisputeEntity> {
    const { trade } = input;
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
    const dispute = await manager.getRepository(TradeDisputeEntity).save(
      manager.getRepository(TradeDisputeEntity).create({
        disputeNumber,
        tradeId: trade.id,
        reasonCode: input.reasonCode,
        status: TradeDisputeStatus.OPEN_UNASSIGNED,
        priority: TradeDisputePriority.NORMAL,
        requestedByUserId: input.requestedByUserId,
        assignedAdminUserId: null,
        leaderAdminUserId: null,
        resolution: null,
        resolutionReason: input.resolutionReason,
        requestedAt: now,
        assignedAt: null,
        resolvedAt: null,
      }),
    );

    await this.appendEvent(manager, {
      trade,
      previousStatus: previous,
      newStatus: trade.status,
      eventCode: input.openEventCode,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      metadata: input.metadata ?? { reasonCode: input.reasonCode },
    });
    if (input.alsoAppendDisputeOpened) {
      await this.appendEvent(manager, {
        trade,
        previousStatus: TradeStatus.DISPUTED,
        newStatus: TradeStatus.DISPUTED,
        eventCode: TradeEventCode.DISPUTE_OPENED,
        actorType: TradeEventActorType.SYSTEM,
        actorUserId: null,
        metadata: { reasonCode: input.reasonCode },
      });
    } else if (input.openEventCode !== TradeEventCode.DISPUTE_OPENED) {
      await this.appendEvent(manager, {
        trade,
        previousStatus: TradeStatus.DISPUTED,
        newStatus: TradeStatus.DISPUTED,
        eventCode: TradeEventCode.DISPUTE_OPENED,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        metadata: { reasonCode: input.reasonCode },
      });
    }
    await this.enqueueTradePartyPushInTransaction(manager, {
      eventType: NotificationEventType.DISPUTE_OPENED,
      actorUserId: input.actorUserId,
      trade,
      deepLink: `/trade/dispute/${dispute.id}`,
    });
    return dispute;
  }

  private async resolveDisputeForceComplete(
    adminUserId: string,
    tradeId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (trade.status === TradeStatus.COMPLETED) {
        return;
      }
      if (
        trade.status !== TradeStatus.DISPUTED &&
        trade.status !== TradeStatus.COIN_TRANSFERRING
      ) {
        throw TradeDomainException.invalidStatus();
      }

      if (trade.status === TradeStatus.DISPUTED) {
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
          eventCode: TradeEventCode.ADMIN_FORCE_COMPLETED,
          actorType: TradeEventActorType.ADMIN,
          actorUserId: adminUserId,
          metadata: { reason },
        });
        await this.appendEvent(manager, {
          trade,
          previousStatus: TradeStatus.COIN_TRANSFERRING,
          newStatus: TradeStatus.COIN_TRANSFERRING,
          eventCode: TradeEventCode.COIN_TRANSFER_STARTED,
          actorType: TradeEventActorType.SYSTEM,
          actorUserId: null,
        });
        await this.markDisputeResolvedInTransaction(manager, {
          tradeId: trade.id,
          resolution: TradeDisputeResolution.FORCE_COMPLETE,
          reason,
        });
        await this.writeAdminAudit(manager, {
          actorUserId: adminUserId,
          actionType: AuditActionType.ADMIN_RESOLVE_TRADE_DISPUTE,
          targetId: trade.id,
          reason,
          afterData: {
            tradeId: trade.id,
            resolution: TradeDisputeResolution.FORCE_COMPLETE,
          },
          ipAddress,
        });
      }
    });

    try {
      await this.transferTradeCoin(tradeId);
    } catch (error) {
      this.logger.warn(
        `force-complete coin transfer deferred for trade=${tradeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveDisputeForceCancel(
    adminUserId: string,
    tradeId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (trade.status === TradeStatus.CANCELLED) {
        return;
      }
      if (trade.status !== TradeStatus.DISPUTED) {
        throw TradeDomainException.invalidStatus();
      }

      let buyOrderMode: 'CANCEL' | 'REMATCH' = 'CANCEL';
      const buyOrder = await manager.getRepository(BuyOrderEntity).findOne({
        where: { id: trade.buyOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      const policy = await this.findActiveMatchingPolicy(manager);
      if (buyOrder && buyOrder.rematchCount < policy.maxRematchCount) {
        buyOrderMode = 'REMATCH';
      }

      await this.markDisputeResolvedInTransaction(manager, {
        tradeId: trade.id,
        resolution: TradeDisputeResolution.FORCE_CANCEL,
        reason,
      });
      await this.appendEvent(manager, {
        trade,
        previousStatus: trade.status,
        newStatus: trade.status,
        eventCode: TradeEventCode.ADMIN_FORCE_CANCELLED,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        metadata: { reason, buyOrderMode },
      });
      await this.finalizeCancelledInTransaction(manager, {
        trade,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        reason,
        buyOrderMode,
      });
      await this.writeAdminAudit(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_RESOLVE_TRADE_DISPUTE,
        targetId: trade.id,
        reason,
        afterData: {
          tradeId: trade.id,
          resolution: TradeDisputeResolution.FORCE_CANCEL,
          buyOrderMode,
        },
        ipAddress,
      });
      await this.enqueueTradePartyPushInTransaction(manager, {
        eventType: NotificationEventType.DISPUTE_RESOLVED,
        actorUserId: adminUserId,
        trade,
      });
    });
  }

  private async resolveDisputeResume(
    adminUserId: string,
    tradeId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const trade = await this.lockTrade(manager, tradeId);
      if (trade.status === TradeStatus.WAITING_BUYER_PAYMENT) {
        return;
      }
      if (trade.status !== TradeStatus.DISPUTED) {
        throw TradeDomainException.invalidStatus();
      }

      const now = new Date();
      const previous = trade.status;
      trade.status = TradeStatus.WAITING_BUYER_PAYMENT;
      trade.buyerReportedPaidAt = null;
      trade.sellerConfirmationDueAt = null;
      trade.buyerPaymentDueAt = new Date(
        now.getTime() + trade.buyerPaymentTimeoutSeconds * 1000,
      );
      await manager.getRepository(TradeEntity).save(trade);

      await this.markDisputeResolvedInTransaction(manager, {
        tradeId: trade.id,
        resolution: TradeDisputeResolution.RESUME,
        reason,
      });
      await this.appendEvent(manager, {
        trade,
        previousStatus: previous,
        newStatus: trade.status,
        eventCode: TradeEventCode.ADMIN_RESUMED_TRADE,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        metadata: { reason },
      });
      await this.appendEvent(manager, {
        trade,
        previousStatus: trade.status,
        newStatus: trade.status,
        eventCode: TradeEventCode.DISPUTE_RESOLVED,
        actorType: TradeEventActorType.ADMIN,
        actorUserId: adminUserId,
        metadata: {
          resolution: TradeDisputeResolution.RESUME,
          reason,
        },
      });
      await this.writeAdminAudit(manager, {
        actorUserId: adminUserId,
        actionType: AuditActionType.ADMIN_RESOLVE_TRADE_DISPUTE,
        targetId: trade.id,
        reason,
        afterData: {
          tradeId: trade.id,
          resolution: TradeDisputeResolution.RESUME,
          status: trade.status,
        },
        ipAddress,
      });
      await this.enqueueTradePartyPushInTransaction(manager, {
        eventType: NotificationEventType.DISPUTE_RESOLVED,
        actorUserId: adminUserId,
        trade,
      });
    });
  }

  private async markDisputeResolvedInTransaction(
    manager: EntityManager,
    input: {
      tradeId: string;
      resolution: TradeDisputeResolution;
      reason: string;
    },
  ): Promise<{
    dispute: TradeDisputeEntity;
    systemAction: TradeDisputeActionEntity;
  }> {
    const dispute = await manager.getRepository(TradeDisputeEntity).findOne({
      where: { tradeId: input.tradeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!dispute) {
      throw TradeDomainException.disputeNotFound();
    }
    if (dispute.status === TradeDisputeStatus.RESOLVED) {
      throw TradeDomainException.disputeAlreadyResolved();
    }
    const systemAction = await this.insertSystemDisputeMessageInTransaction(
      manager,
      {
        disputeId: dispute.id,
        kind: 'RESOLVED',
        message: DISPUTE_SYSTEM_MESSAGE_CLOSED,
      },
    );
    dispute.status = TradeDisputeStatus.RESOLVED;
    dispute.resolution = input.resolution;
    dispute.resolutionReason = input.reason;
    dispute.resolvedAt = new Date();
    await manager.getRepository(TradeDisputeEntity).save(dispute);
    return { dispute, systemAction };
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

  private async lockDispute(
    manager: EntityManager,
    disputeId: string,
  ): Promise<TradeDisputeEntity> {
    const dispute = await manager.getRepository(TradeDisputeEntity).findOne({
      where: { id: disputeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!dispute) {
      throw TradeDomainException.disputeNotFound();
    }
    return dispute;
  }

  private assertDisputeNotTerminal(dispute: TradeDisputeEntity): void {
    if (
      dispute.status === TradeDisputeStatus.RESOLVED ||
      dispute.status === TradeDisputeStatus.CANCELLED
    ) {
      throw TradeDomainException.disputeAlreadyResolved();
    }
  }

  private assertDisputeWritable(dispute: TradeDisputeEntity): void {
    if (
      dispute.status === TradeDisputeStatus.RESOLVED ||
      dispute.status === TradeDisputeStatus.CANCELLED
    ) {
      throw TradeDomainException.disputeClosed();
    }
  }

  private async loadDisputeWithTrade(
    disputeId: string,
  ): Promise<TradeDisputeEntity> {
    const dispute = await this.tradeDisputeRepository.findOne({
      where: { id: disputeId },
      relations: { trade: true },
    });
    if (!dispute?.trade) {
      throw TradeDomainException.disputeNotFound();
    }
    return dispute;
  }

  private counterpartUserId(trade: TradeEntity, userId: string): string {
    return trade.buyerUserId === userId
      ? trade.sellerUserId
      : trade.buyerUserId;
  }

  private canChatDispute(status: TradeDisputeStatus): boolean {
    return OPEN_DISPUTE_STATUSES.includes(status);
  }

  private disputeActionActorRole(
    action: TradeDisputeActionEntity,
    trade: TradeEntity,
  ): TradeEventActorType {
    if (action.actorUserId == null) {
      return TradeEventActorType.SYSTEM;
    }
    if (action.actorUserId === trade.buyerUserId) {
      return TradeEventActorType.BUYER;
    }
    if (action.actorUserId === trade.sellerUserId) {
      return TradeEventActorType.SELLER;
    }
    return TradeEventActorType.ADMIN;
  }

  private toTradeDisputeSummary(dispute: TradeDisputeEntity) {
    return {
      id: dispute.id,
      status: dispute.status,
      canChat: this.canChatDispute(dispute.status),
    };
  }

  private toPartyDisputeDetail(
    dispute: TradeDisputeEntity,
  ): PartyDisputeDetailDto {
    return {
      ...this.toTradeDisputeSummary(dispute),
      tradeId: dispute.tradeId,
      displayName: DISPUTE_TEAM_DISPLAY_NAME,
    };
  }

  private toPartyDisputeMessage(
    action: TradeDisputeActionEntity,
    trade: TradeEntity,
    viewerUserId: string,
    counterpartNickname: string | null,
  ): PartyDisputeMessageDto {
    const actorRole = this.disputeActionActorRole(action, trade);
    const isMine = action.actorUserId === viewerUserId;
    let displayName = DISPUTE_TEAM_DISPLAY_NAME;
    if (actorRole === TradeEventActorType.BUYER || actorRole === TradeEventActorType.SELLER) {
      displayName = isMine ? '나' : maskNickname(counterpartNickname);
    }
    return {
      id: action.id,
      actionType: action.actionType,
      actorRole,
      displayName,
      isMine,
      body: action.message ?? '',
      imageUrl: this.evidenceImageUrl(action),
      createdAt: action.createdAt,
    };
  }

  private toAdminDisputeMessage(
    action: TradeDisputeActionEntity,
    trade: TradeEntity,
  ): AdminDisputeMessageDto {
    return {
      id: action.id,
      actionType: action.actionType,
      isInternal: action.isInternal,
      actorUserId: action.actorUserId,
      actorRole: this.disputeActionActorRole(action, trade),
      body: action.message ?? '',
      imageUrl: this.evidenceImageUrl(action),
      createdAt: action.createdAt,
    };
  }

  private evidenceImageUrl(
    action: TradeDisputeActionEntity,
  ): string | null {
    if (action.actionType !== TradeDisputeActionType.EVIDENCE) {
      return null;
    }
    const url = action.metadata?.['url'];
    return typeof url === 'string' ? url : null;
  }

  private async insertDisputeActionInTransaction(
    manager: EntityManager,
    input: {
      disputeId: string;
      actionType: TradeDisputeActionType;
      actorUserId: string | null;
      isInternal: boolean;
      message: string;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<TradeDisputeActionEntity> {
    const repository = manager.getRepository(TradeDisputeActionEntity);
    return repository.save(
      repository.create({
        disputeId: input.disputeId,
        actionType: input.actionType,
        actorUserId: input.actorUserId,
        isInternal: input.isInternal,
        message: input.message,
        metadata: input.metadata ?? null,
      }),
    );
  }

  private async insertSystemDisputeMessageInTransaction(
    manager: EntityManager,
    input: {
      disputeId: string;
      kind: 'ASSIGNED' | 'RESOLVED';
      message: string;
    },
  ): Promise<TradeDisputeActionEntity> {
    return this.insertDisputeActionInTransaction(manager, {
      disputeId: input.disputeId,
      actionType: TradeDisputeActionType.MESSAGE,
      actorUserId: null,
      isInternal: false,
      message: input.message,
      metadata: { kind: input.kind },
    });
  }

  private async applyDisputeAssignmentInTransaction(
    manager: EntityManager,
    input: {
      dispute: TradeDisputeEntity;
      actorUserId: string;
      assigneeUserId: string;
      reason: string;
      ipAddress: string | null;
    },
  ): Promise<TradeDisputeActionEntity> {
    const now = new Date();
    const previousStatus = input.dispute.status;
    input.dispute.assignedAdminUserId = input.assigneeUserId;
    input.dispute.assignedAt = now;
    if (input.dispute.status === TradeDisputeStatus.OPEN_UNASSIGNED) {
      input.dispute.status = TradeDisputeStatus.ASSIGNED;
    }
    await manager.getRepository(TradeDisputeEntity).save(input.dispute);

    const trade = await this.lockTrade(manager, input.dispute.tradeId);
    await this.appendEvent(manager, {
      trade,
      previousStatus: trade.status,
      newStatus: trade.status,
      eventCode: TradeEventCode.DISPUTE_ASSIGNED,
      actorType: TradeEventActorType.ADMIN,
      actorUserId: input.actorUserId,
      metadata: {
        assignedAdminUserId: input.assigneeUserId,
        previousDisputeStatus: previousStatus,
      },
    });
    await this.writeAdminAudit(manager, {
      actorUserId: input.actorUserId,
      actionType: AuditActionType.ADMIN_ASSIGN_TRADE_DISPUTE,
      targetId: trade.id,
      reason: input.reason,
      afterData: {
        tradeId: trade.id,
        disputeId: input.dispute.id,
        assignedAdminUserId: input.assigneeUserId,
        status: input.dispute.status,
      },
      ipAddress: input.ipAddress,
    });
    return this.insertSystemDisputeMessageInTransaction(manager, {
      disputeId: input.dispute.id,
      kind: 'ASSIGNED',
      message: DISPUTE_SYSTEM_MESSAGE_JOINED,
    });
  }

  private publishTradeUpdated(tradeId: string): void {
    void this.tradeRepository
      .findOne({
        where: { id: tradeId },
        select: { id: true, status: true, buyerUserId: true, sellerUserId: true },
      })
      .then((trade) => {
        if (!trade) return;
        this.tradeRealtime.publishUpdated({
          tradeId: trade.id,
          status: trade.status,
          buyerUserId: trade.buyerUserId,
          sellerUserId: trade.sellerUserId,
        });
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `publishTradeUpdated failed trade=${tradeId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private publishDisputeOpenedIfPresent(
    opened: TradeDisputeEntity | null,
  ): void {
    if (!opened) return;
    void this.tradeRepository
      .findOne({ where: { id: opened.tradeId } })
      .then((trade) => {
        this.disputeRealtime.publishDisputeOpened({
          disputeId: opened.id,
          tradeId: opened.tradeId,
          status: opened.status,
          buyerUserId: trade?.buyerUserId,
          sellerUserId: trade?.sellerUserId,
        });
      });
  }

  private async publishAssignmentRealtime(
    disputeId: string,
    systemAction: TradeDisputeActionEntity | null,
  ): Promise<void> {
    const dispute = await this.loadDisputeWithTrade(disputeId);
    if (systemAction) {
      void this.disputeRealtime.publishMessageCreated({
        disputeId,
        message: this.toAdminDisputeMessage(systemAction, dispute.trade),
      });
    }
    this.disputeRealtime.publishDisputeUpdated({
      disputeId,
      tradeId: dispute.tradeId,
      status: dispute.status,
    });
  }

  private async publishDisputeResolvedForTrade(
    tradeId: string,
  ): Promise<void> {
    const dispute = await this.tradeDisputeRepository.findOne({
      where: { tradeId },
      relations: { trade: true },
    });
    if (!dispute?.trade || dispute.status !== TradeDisputeStatus.RESOLVED) {
      return;
    }
    const recent = await this.tradeDisputeActionRepository.find({
      where: { disputeId: dispute.id, isInternal: false },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 10,
    });
    const systemAction =
      recent.find(
        (row) =>
          row.metadata != null &&
          typeof row.metadata === 'object' &&
          (row.metadata as { kind?: string }).kind === 'RESOLVED',
      ) ?? recent[0];
    if (systemAction) {
      void this.disputeRealtime.publishMessageCreated({
        disputeId: dispute.id,
        message: this.toAdminDisputeMessage(systemAction, dispute.trade),
      });
    }
    this.disputeRealtime.publishDisputeResolved({
      disputeId: dispute.id,
      tradeId: dispute.tradeId,
      status: dispute.status,
    });
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
      canWithdrawPaymentReport:
        isBuyer &&
        waitingSeller &&
        trade.buyerReportedPaidAt != null &&
        Date.now() - trade.buyerReportedPaidAt.getTime() <=
          PAYMENT_REPORT_WITHDRAW_WINDOW_MS,
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
      canDenyPayment: isSeller && waitingSeller,
      canOpenDispute: isBuyer && waitingSeller,
    };
  }

  private async loadDisputesByTradeIds(
    tradeIds: string[],
  ): Promise<Map<string, TradeDisputeEntity>> {
    if (tradeIds.length === 0) {
      return new Map();
    }
    const disputes = await this.tradeDisputeRepository.find({
      where: { tradeId: In(tradeIds) },
    });
    return new Map(disputes.map((dispute) => [dispute.tradeId, dispute]));
  }

  private toListItem(
    trade: TradeEntity,
    userId: string,
    dispute: TradeDisputeEntity | null = null,
  ): TradeListItemDto {
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
      dispute: dispute ? this.toTradeDisputeSummary(dispute) : null,
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
    const bank =
      role === TradeViewerRole.BUYER
        ? await this.banksService.resolveDisplayByCode(trade.sellerBankCode)
        : null;
    const dispute = await this.tradeDisputeRepository.findOne({
      where: { tradeId: trade.id },
    });

    return {
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      role,
      status: trade.status,
      coinAmount: trade.coinAmount,
      paymentAmount: trade.paymentAmount,
      payment:
        role === TradeViewerRole.BUYER && bank
          ? {
              bankCode: bank.code,
              bankName: bank.name,
              iconUrl: bank.iconUrl,
              accountNumber: trade.sellerAccountNumber,
              accountHolderName: trade.sellerAccountHolderName,
              dueAt: trade.buyerPaymentDueAt,
            }
          : null,
      counterparty: { nickname: maskNickname(nickname) },
      dispute: dispute ? this.toTradeDisputeSummary(dispute) : null,
      actions: this.computeActions(trade, role, events),
      buyerPaymentDueAt: trade.buyerPaymentDueAt,
      sellerConfirmationDueAt: trade.sellerConfirmationDueAt,
      createdAt: trade.createdAt,
      cancelledAt: trade.cancelledAt,
      cancellationReason: trade.cancellationReason,
      ...flags,
    };
  }

  private async resolveBankName(bankCode: string): Promise<string> {
    const bank = await this.banksService.resolveDisplayByCode(bankCode);
    return bank.name;
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
    if (query.partyUserId) {
      qb.andWhere(
        '(trade.buyer_user_id = :partyUserId OR trade.seller_user_id = :partyUserId)',
        { partyUserId: query.partyUserId },
      );
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

  private applyAdminDisputeListFilters(
    qb: SelectQueryBuilder<TradeDisputeEntity>,
    query: SearchAdminDisputesDto,
    actorUserId: string,
  ): void {
    if (query.status) {
      qb.andWhere('dispute.status = :status', { status: query.status });
    } else {
      qb.andWhere('dispute.status IN (:...openStatuses)', {
        openStatuses: OPEN_DISPUTE_STATUSES,
      });
    }
    if (query.reasonCode) {
      qb.andWhere('dispute.reason_code = :reasonCode', {
        reasonCode: query.reasonCode,
      });
    }
    if (query.priority) {
      qb.andWhere('dispute.priority = :priority', {
        priority: query.priority,
      });
    }
    if (query.assignee === 'unassigned') {
      qb.andWhere('dispute.assigned_admin_user_id IS NULL');
    } else if (query.assignee === 'me') {
      qb.andWhere('dispute.assigned_admin_user_id = :assigneeId', {
        assigneeId: actorUserId,
      });
    } else if (query.assignee) {
      qb.andWhere('dispute.assigned_admin_user_id = :assigneeId', {
        assigneeId: query.assignee,
      });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        `(
          dispute.dispute_number ILIKE :like
          OR trade.trade_number ILIKE :like
        )`,
        { like: `%${query.keyword.trim()}%` },
      );
    }
    if (query.partyUserId) {
      qb.andWhere(
        '(trade.buyer_user_id = :partyUserId OR trade.seller_user_id = :partyUserId)',
        { partyUserId: query.partyUserId },
      );
    }
  }

  private toAdminTradeDispute(dispute: TradeDisputeEntity): AdminTradeDisputeDto {
    return {
      id: dispute.id,
      disputeNumber: dispute.disputeNumber,
      status: dispute.status,
      priority: dispute.priority,
      reasonCode: dispute.reasonCode,
      requestedAt: dispute.requestedAt,
      assignedAdminUserId: dispute.assignedAdminUserId,
      assignedAt: dispute.assignedAt,
    };
  }

  private toAdminDisputeListItem(
    row: TradeDisputeEntity,
    parties: Map<string, AdminPartySummary>,
  ): AdminDisputeListItemDto {
    const trade = row.trade;
    return {
      id: row.id,
      disputeNumber: row.disputeNumber,
      tradeId: row.tradeId,
      tradeNumber: trade.tradeNumber,
      status: row.status,
      priority: row.priority,
      reasonCode: row.reasonCode,
      buyer: this.userService.toAdminPartyDto(parties.get(trade.buyerUserId)),
      seller: this.userService.toAdminPartyDto(parties.get(trade.sellerUserId)),
      paymentAmount: trade.paymentAmount,
      coinAmount: trade.coinAmount,
      assignedAdminUserId: row.assignedAdminUserId,
      requestedAt: row.requestedAt,
      resolution: row.resolution,
      resolvedAt: row.resolvedAt,
    };
  }

  private async toAdminDisputeDetail(
    dispute: TradeDisputeEntity,
  ): Promise<AdminDisputeDetailDto> {
    const trade = dispute.trade;
    if (!trade) {
      throw TradeDomainException.notFound();
    }
    const [events, bankName, parties] = await Promise.all([
      this.loadEvents(trade.id),
      this.resolveBankName(trade.sellerBankCode),
      this.userService.getAdminPartySummaries([
        trade.buyerUserId,
        trade.sellerUserId,
      ]),
    ]);
    const listItem = this.toAdminDisputeListItem(dispute, parties);
    return {
      ...listItem,
      assignedAt: dispute.assignedAt,
      trade: {
        id: trade.id,
        tradeNumber: trade.tradeNumber,
        status: trade.status,
        coinAmount: trade.coinAmount,
        paymentAmount: trade.paymentAmount,
        buyer: listItem.buyer,
        seller: listItem.seller,
        sellerBankAccount: {
          bankCode: trade.sellerBankCode,
          bankName,
          accountNumber: maskAccountNumber(trade.sellerAccountNumber),
          holderName: trade.sellerAccountHolderName,
        },
        buyerReportedPaidAt: trade.buyerReportedPaidAt,
        sellerConfirmationDueAt: trade.sellerConfirmationDueAt,
        events: events.map((event) => this.toAdminTradeEvent(event)),
      },
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
