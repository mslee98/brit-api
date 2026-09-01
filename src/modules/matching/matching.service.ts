import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { AdminMatchingAttemptItemDto } from '../orders/dto/admin-order-list-response.dto';
import { BuyMatchType } from '../orders/domain/enums/buy-match-type.enum';
import { BuyOrderStatus } from '../orders/domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../orders/domain/enums/sell-order-status.enum';
import { deriveSellOrderStatus } from '../orders/utils/sell-order-status.util';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../orders/infrastructure/entities/matching-policy.entity';
import { SellOrderCoinLotEntity } from '../orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { NotificationEventType } from '../notifications/domain/enums/notification-event-type.enum';
import { NotificationReferenceType } from '../notifications/domain/enums/notification-reference-type.enum';
import { NotificationService } from '../notifications/notification.service';
import { TradeStatus } from '../trades/domain/enums/trade-status.enum';
import { TradeEntity } from '../trades/infrastructure/entities/trade.entity';
import { TradeService } from '../trades/trade.service';
import { maskNickname } from '../trades/utils/nickname-mask.util';
import { UserBankAccountStatus } from '../users/domain/enums/user-bank-account-status.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import {
  BUY_MATCHING_TIMEOUT_SECONDS,
  CANDIDATE_DEFAULT_LIMIT,
  CANDIDATE_MAX_LIMIT,
} from './domain/constants/matching.constants';
import { MatchingAttemptResult } from './domain/enums/matching-attempt-result.enum';
import { TradeRequestRejectionReason } from './domain/enums/trade-request-rejection-reason.enum';
import { TradeRequestStatus } from './domain/enums/trade-request-status.enum';
import {
  AcceptTradeRequestResponseDto,
  ApplyBuyOrderResponseDto,
  MatchBuyOrderDto,
  MatchBuyOrderResponseDto,
  MatchingCandidateItemDto,
  MatchingCandidatesResponseDto,
  MatchingStatusResponseDto,
  SearchMatchingCandidatesDto,
  TradeRequestResponseDto,
} from './dto/matching-response.dto';
import { MatchingDomainException } from './exceptions/matching.exceptions';
import { MatchingAttemptEntity } from './infrastructure/entities/matching-attempt.entity';
import { TradeRequestEntity } from './infrastructure/entities/trade-request.entity';
import { SearchMatchingAttemptsDto } from './dto/search-matching-attempts.dto';
import { TradeRequestReservationService } from './trade-request-reservation.service';

type CandidateCursor = {
  completedTradeCount: number;
  createdAt: string;
  sellOrderId: string;
  absDiff?: string;
};

type CandidateRow = {
  id: string;
  remaining_coin_amount: string;
  created_at: Date;
  nickname: string | null;
  completed_trade_count: string;
  abs_diff?: string;
};

/**
 * Browse+Select 매칭.
 * Candidate 조회는 Projection.
 * Trade 즉시 생성: selectMatch. 판매자 수락 신청: applyToSellOrder (M2).
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly tradeService: TradeService,
    private readonly notificationService: NotificationService,
    private readonly tradeRequestReservationService: TradeRequestReservationService,
    @InjectRepository(BuyOrderEntity)
    private readonly buyOrderRepository: Repository<BuyOrderEntity>,
    @InjectRepository(MatchingAttemptEntity)
    private readonly matchingAttemptRepository: Repository<MatchingAttemptEntity>,
    @InjectRepository(TradeRequestEntity)
    private readonly tradeRequestRepository: Repository<TradeRequestEntity>,
  ) {}

  async selectMatch(
    buyerUserId: string,
    buyOrderId: string,
    dto: MatchBuyOrderDto,
  ): Promise<MatchBuyOrderResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const buyOrderRepository = manager.getRepository(BuyOrderEntity);
      const buyOrder = await buyOrderRepository.findOne({
        where: { id: buyOrderId, buyerUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!buyOrder) {
        throw MatchingDomainException.buyOrderNotFound();
      }
      if (buyOrder.status === BuyOrderStatus.MATCHED) {
        throw MatchingDomainException.alreadyMatched();
      }
      if (buyOrder.status !== BuyOrderStatus.MATCHING) {
        throw MatchingDomainException.buyOrderNotMatchable();
      }
      if (this.isBuyOrderTimedOut(buyOrder, new Date())) {
        buyOrder.status = BuyOrderStatus.EXPIRED;
        buyOrder.nextMatchableAt = null;
        await buyOrderRepository.save(buyOrder);
        throw MatchingDomainException.buyOrderNotMatchable();
      }

      const sellOrder = await manager.getRepository(SellOrderEntity).findOne({
        where: { id: dto.sellOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sellOrder || !this.isSellOrderSelectable(sellOrder, buyOrder.buyerUserId)) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const policy = await this.findActiveMatchingPolicy(manager);
      const computed = this.computeMatch(
        buyOrder.coinAmount,
        sellOrder.remainingCoinAmount,
        policy.nearMatchMaxRatioBps,
      );
      if (!computed) {
        throw MatchingDomainException.sellOrderUnavailable();
      }
      if (
        computed.matchType !== dto.expectedMatchType ||
        computed.coinAmount !== dto.expectedCoinAmount
      ) {
        throw MatchingDomainException.candidateChanged();
      }

      const sellerBank =
        await this.userService.getActiveBankAccountPlaintextInTransaction(
          manager,
          sellOrder.sellerUserId,
        );
      if (!sellerBank) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const matchAmount = BigInt(computed.coinAmount);
      const remaining = BigInt(sellOrder.remainingCoinAmount);
      const reserved = BigInt(sellOrder.reservedCoinAmount);
      if (remaining < matchAmount) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const nextRemaining = remaining - matchAmount;
      const nextReserved = reserved + matchAmount;
      sellOrder.remainingCoinAmount = nextRemaining.toString();
      sellOrder.reservedCoinAmount = nextReserved.toString();
      sellOrder.status = deriveSellOrderStatus(nextRemaining, nextReserved);
      await manager.getRepository(SellOrderEntity).save(sellOrder);

      const now = new Date();
      const lotAllocations = await this.allocateTradeCoinLotsFifo(
        manager,
        sellOrder.id,
        matchAmount,
      );

      const trade = await this.tradeService.createMatchedTradeInTransaction(
        manager,
        {
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          buyerUserId: buyOrder.buyerUserId,
          sellerUserId: sellOrder.sellerUserId,
          coinAmount: computed.coinAmount,
          sellerBank: {
            bankAccountId: sellerBank.bankAccountId,
            bankCode: sellerBank.bankCode,
            accountNumber: sellerBank.accountNumber,
            accountHolderName: sellerBank.accountHolderName,
          },
          buyerPaymentTimeoutSeconds: policy.buyerPaymentTimeoutSeconds,
          sellerConfirmationTimeoutSeconds:
            policy.sellerConfirmationTimeoutSeconds,
          lotAllocations,
          now,
        },
      );

      await manager.getRepository(MatchingAttemptEntity).save(
        manager.getRepository(MatchingAttemptEntity).create({
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          result: MatchingAttemptResult.MATCHED,
          tradeId: trade.id,
          reasonCode: null,
          attemptedAt: now,
        }),
      );

      buyOrder.status = BuyOrderStatus.MATCHED;
      buyOrder.matchedAt = now;
      buyOrder.matchedCoinAmount = computed.coinAmount;
      buyOrder.matchType = computed.matchType;
      buyOrder.nextMatchableAt = null;
      await buyOrderRepository.save(buyOrder);

      return {
        buyOrderId: buyOrder.id,
        tradeId: trade.id,
        match: {
          type: computed.matchType,
          coinAmount: computed.coinAmount,
        },
        tradeStatus: TradeStatus.WAITING_BUYER_PAYMENT,
      };
    });
  }

  /**
   * 구매자 Apply: 물량 선점 + TradeRequest PENDING_SELLER.
   * Trade는 만들지 않음 (Accept = M3).
   */
  async applyToSellOrder(
    buyerUserId: string,
    buyOrderId: string,
    dto: MatchBuyOrderDto,
    idempotencyKey: string,
  ): Promise<ApplyBuyOrderResponseDto> {
    const key = idempotencyKey.trim();

    return this.dataSource.transaction(async (manager) => {
      const buyOrderRepository = manager.getRepository(BuyOrderEntity);
      const tradeRequestRepository = manager.getRepository(TradeRequestEntity);
      const sellOrderRepository = manager.getRepository(SellOrderEntity);

      const buyOrder = await buyOrderRepository.findOne({
        where: { id: buyOrderId, buyerUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!buyOrder) {
        throw MatchingDomainException.buyOrderNotFound();
      }

      const existingByKey = await tradeRequestRepository.findOne({
        where: { buyerUserId, idempotencyKey: key },
      });
      if (existingByKey) {
        return ApplyBuyOrderResponseDto.from(existingByKey);
      }

      if (buyOrder.status === BuyOrderStatus.MATCHED) {
        throw MatchingDomainException.alreadyMatched();
      }
      if (buyOrder.status === BuyOrderStatus.REQUEST_PENDING) {
        throw MatchingDomainException.buyOrderPendingRequest();
      }
      if (buyOrder.status !== BuyOrderStatus.MATCHING) {
        throw MatchingDomainException.buyOrderNotMatchable();
      }
      if (this.isBuyOrderTimedOut(buyOrder, new Date())) {
        buyOrder.status = BuyOrderStatus.EXPIRED;
        buyOrder.nextMatchableAt = null;
        await buyOrderRepository.save(buyOrder);
        throw MatchingDomainException.buyOrderNotMatchable();
      }

      const pendingOnBuy = await tradeRequestRepository.findOne({
        where: {
          buyOrderId: buyOrder.id,
          status: TradeRequestStatus.PENDING_SELLER,
        },
      });
      if (pendingOnBuy) {
        throw MatchingDomainException.buyOrderPendingRequest();
      }

      const sellOrder = await sellOrderRepository.findOne({
        where: { id: dto.sellOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sellOrder) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const pendingOnSell = await tradeRequestRepository.findOne({
        where: {
          sellOrderId: sellOrder.id,
          status: TradeRequestStatus.PENDING_SELLER,
        },
      });
      if (pendingOnSell) {
        throw MatchingDomainException.sellOrderPendingRequest();
      }

      if (!this.isSellOrderSelectable(sellOrder, buyOrder.buyerUserId)) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const policy = await this.findActiveMatchingPolicy(manager);
      const computed = this.computeMatch(
        buyOrder.coinAmount,
        sellOrder.remainingCoinAmount,
        policy.nearMatchMaxRatioBps,
      );
      if (!computed) {
        throw MatchingDomainException.sellOrderUnavailable();
      }
      if (
        computed.matchType !== dto.expectedMatchType ||
        computed.coinAmount !== dto.expectedCoinAmount
      ) {
        throw MatchingDomainException.candidateChanged();
      }

      const matchAmount = BigInt(computed.coinAmount);
      const remaining = BigInt(sellOrder.remainingCoinAmount);
      const reserved = BigInt(sellOrder.reservedCoinAmount);
      if (remaining < matchAmount) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + policy.tradeRequestTimeoutSeconds * 1000,
      );

      let tradeRequest: TradeRequestEntity;
      try {
        tradeRequest = await tradeRequestRepository.save(
          tradeRequestRepository.create({
            buyOrderId: buyOrder.id,
            sellOrderId: sellOrder.id,
            buyerUserId: buyOrder.buyerUserId,
            sellerUserId: sellOrder.sellerUserId,
            requestedCoinAmount: computed.coinAmount,
            matchType: computed.matchType,
            status: TradeRequestStatus.PENDING_SELLER,
            expiresAt,
            rejectionReasonCode: null,
            acceptedAt: null,
            rejectedAt: null,
            cancelledAt: null,
            expiredAt: null,
            idempotencyKey: key,
          }),
        );
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
        const racedByKey = await tradeRequestRepository.findOne({
          where: { buyerUserId, idempotencyKey: key },
        });
        if (racedByKey) {
          return ApplyBuyOrderResponseDto.from(racedByKey);
        }
        throw MatchingDomainException.sellOrderPendingRequest();
      }

      const nextRemaining = remaining - matchAmount;
      const nextReserved = reserved + matchAmount;
      sellOrder.remainingCoinAmount = nextRemaining.toString();
      sellOrder.reservedCoinAmount = nextReserved.toString();
      sellOrder.status = deriveSellOrderStatus(nextRemaining, nextReserved);
      await sellOrderRepository.save(sellOrder);

      buyOrder.status = BuyOrderStatus.REQUEST_PENDING;
      buyOrder.nextMatchableAt = null;
      await buyOrderRepository.save(buyOrder);

      await this.notificationService.enqueueTradePushInTransaction(manager, {
        eventType: NotificationEventType.TRADE_REQUEST_CREATED,
        actorUserId: buyOrder.buyerUserId,
        referenceType: NotificationReferenceType.TRADE_REQUEST,
        referenceId: tradeRequest.id,
        deepLink: `/trade/sell/${sellOrder.id}`,
        recipientUserId: sellOrder.sellerUserId,
        recipientRole: 'SELLER',
        sellOrderId: sellOrder.id,
      });

      return ApplyBuyOrderResponseDto.from(tradeRequest);
    });
  }

  async getTradeRequest(
    userId: string,
    tradeRequestId: string,
  ): Promise<TradeRequestResponseDto> {
    const request = await this.tradeRequestRepository.findOne({
      where: { id: tradeRequestId },
    });
    if (
      !request ||
      (request.buyerUserId !== userId && request.sellerUserId !== userId)
    ) {
      throw MatchingDomainException.tradeRequestNotFound();
    }

    const trade = await this.dataSource.getRepository(TradeEntity).findOne({
      where: { tradeRequestId: request.id },
    });

    return TradeRequestResponseDto.from(request, trade?.id ?? null);
  }

  /**
   * 판매자용: Sell에 PENDING_SELLER Request 1건 (없으면 null).
   */
  async findPendingBySellOrder(
    sellerUserId: string,
    sellOrderId: string,
  ): Promise<TradeRequestResponseDto | null> {
    const request = await this.tradeRequestRepository.findOne({
      where: {
        sellOrderId,
        sellerUserId,
        status: TradeRequestStatus.PENDING_SELLER,
      },
    });
    if (!request) {
      return null;
    }
    return TradeRequestResponseDto.from(request, null);
  }

  /**
   * 판매자 Accept: Reservation 재차감 없이 Trade Binding.
   */
  async acceptTradeRequest(
    sellerUserId: string,
    tradeRequestId: string,
  ): Promise<AcceptTradeRequestResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const tradeRequestRepository = manager.getRepository(TradeRequestEntity);
      const buyOrderRepository = manager.getRepository(BuyOrderEntity);
      const sellOrderRepository = manager.getRepository(SellOrderEntity);

      const request = await tradeRequestRepository.findOne({
        where: { id: tradeRequestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.sellerUserId !== sellerUserId) {
        throw MatchingDomainException.tradeRequestNotFound();
      }

      if (request.status === TradeRequestStatus.ACCEPTED) {
        const existingTrade = await manager.getRepository(TradeEntity).findOne({
          where: { tradeRequestId: request.id },
        });
        if (!existingTrade) {
          throw MatchingDomainException.requestStale();
        }
        return {
          tradeRequestId: request.id,
          tradeId: existingTrade.id,
          tradeStatus: existingTrade.status,
          match: {
            type: request.matchType,
            coinAmount: request.requestedCoinAmount,
          },
        };
      }

      if (
        request.status === TradeRequestStatus.EXPIRED ||
        request.expiresAt.getTime() <= Date.now()
      ) {
        throw MatchingDomainException.tradeRequestExpired();
      }
      if (request.status !== TradeRequestStatus.PENDING_SELLER) {
        throw MatchingDomainException.tradeRequestNotPending();
      }

      const buyOrder = await buyOrderRepository.findOne({
        where: { id: request.buyOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!buyOrder || buyOrder.status !== BuyOrderStatus.REQUEST_PENDING) {
        throw MatchingDomainException.requestStale();
      }

      const sellOrder = await sellOrderRepository.findOne({
        where: { id: request.sellOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sellOrder) {
        throw MatchingDomainException.requestStale();
      }

      const reserved = BigInt(sellOrder.reservedCoinAmount);
      const snapshotAmount = BigInt(request.requestedCoinAmount);
      if (reserved < snapshotAmount) {
        throw MatchingDomainException.requestStale();
      }

      const sellerBank =
        await this.userService.getActiveBankAccountPlaintextInTransaction(
          manager,
          sellOrder.sellerUserId,
        );
      if (!sellerBank) {
        throw MatchingDomainException.sellOrderUnavailable();
      }

      const policy = await this.findActiveMatchingPolicy(manager);
      const now = new Date();
      const lotAllocations = await this.allocateTradeCoinLotsFifo(
        manager,
        sellOrder.id,
        snapshotAmount,
      );

      const trade = await this.tradeService.createMatchedTradeInTransaction(
        manager,
        {
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          buyerUserId: buyOrder.buyerUserId,
          sellerUserId: sellOrder.sellerUserId,
          coinAmount: request.requestedCoinAmount,
          sellerBank: {
            bankAccountId: sellerBank.bankAccountId,
            bankCode: sellerBank.bankCode,
            accountNumber: sellerBank.accountNumber,
            accountHolderName: sellerBank.accountHolderName,
          },
          buyerPaymentTimeoutSeconds: policy.buyerPaymentTimeoutSeconds,
          sellerConfirmationTimeoutSeconds:
            policy.sellerConfirmationTimeoutSeconds,
          lotAllocations,
          now,
          tradeRequestId: request.id,
        },
      );

      await manager.getRepository(MatchingAttemptEntity).save(
        manager.getRepository(MatchingAttemptEntity).create({
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          result: MatchingAttemptResult.MATCHED,
          tradeId: trade.id,
          reasonCode: null,
          attemptedAt: now,
        }),
      );

      buyOrder.status = BuyOrderStatus.MATCHED;
      buyOrder.matchedAt = now;
      buyOrder.matchedCoinAmount = request.requestedCoinAmount;
      buyOrder.matchType = request.matchType;
      buyOrder.nextMatchableAt = null;
      await buyOrderRepository.save(buyOrder);

      request.status = TradeRequestStatus.ACCEPTED;
      request.acceptedAt = now;
      await tradeRequestRepository.save(request);

      await this.notificationService.enqueueTradePushInTransaction(manager, {
        eventType: NotificationEventType.TRADE_REQUEST_ACCEPTED,
        actorUserId: sellerUserId,
        referenceType: NotificationReferenceType.TRADE,
        referenceId: trade.id,
        deepLink: `/trade?tradeId=${trade.id}`,
        recipientUserId: buyOrder.buyerUserId,
        recipientRole: 'BUYER',
        tradeId: trade.id,
        buyOrderId: buyOrder.id,
      });

      return {
        tradeRequestId: request.id,
        tradeId: trade.id,
        tradeStatus: trade.status,
        match: {
          type: request.matchType,
          coinAmount: request.requestedCoinAmount,
        },
      };
    });
  }

  async rejectTradeRequest(
    sellerUserId: string,
    tradeRequestId: string,
    reasonCode: TradeRequestRejectionReason,
  ): Promise<TradeRequestResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const tradeRequestRepository = manager.getRepository(TradeRequestEntity);
      const request = await tradeRequestRepository.findOne({
        where: { id: tradeRequestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.sellerUserId !== sellerUserId) {
        throw MatchingDomainException.tradeRequestNotFound();
      }
      if (
        request.status === TradeRequestStatus.EXPIRED ||
        request.expiresAt.getTime() <= Date.now()
      ) {
        throw MatchingDomainException.tradeRequestExpired();
      }
      if (request.status !== TradeRequestStatus.PENDING_SELLER) {
        throw MatchingDomainException.tradeRequestNotPending();
      }

      const now = new Date();
      request.status = TradeRequestStatus.REJECTED;
      request.rejectionReasonCode = reasonCode;
      request.rejectedAt = now;
      await tradeRequestRepository.save(request);

      await this.tradeRequestReservationService.release(manager, request);

      return TradeRequestResponseDto.from(request, null);
    });
  }

  async cancelTradeRequest(
    buyerUserId: string,
    tradeRequestId: string,
  ): Promise<TradeRequestResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const tradeRequestRepository = manager.getRepository(TradeRequestEntity);
      const request = await tradeRequestRepository.findOne({
        where: { id: tradeRequestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.buyerUserId !== buyerUserId) {
        throw MatchingDomainException.tradeRequestNotFound();
      }
      if (
        request.status === TradeRequestStatus.EXPIRED ||
        request.expiresAt.getTime() <= Date.now()
      ) {
        throw MatchingDomainException.tradeRequestExpired();
      }
      if (request.status !== TradeRequestStatus.PENDING_SELLER) {
        throw MatchingDomainException.tradeRequestNotPending();
      }

      const now = new Date();
      request.status = TradeRequestStatus.CANCELLED_BY_BUYER;
      request.cancelledAt = now;
      await tradeRequestRepository.save(request);

      await this.tradeRequestReservationService.release(manager, request);

      return TradeRequestResponseDto.from(request, null);
    });
  }

  async listCandidates(
    buyerUserId: string,
    buyOrderId: string,
    query: SearchMatchingCandidatesDto,
  ): Promise<MatchingCandidatesResponseDto> {
    const buyOrder = await this.buyOrderRepository.findOne({
      where: { id: buyOrderId, buyerUserId },
    });
    if (!buyOrder) {
      throw MatchingDomainException.buyOrderNotFound();
    }
    if (buyOrder.status === BuyOrderStatus.REQUEST_PENDING) {
      throw MatchingDomainException.buyOrderRequestPending();
    }
    if (buyOrder.status !== BuyOrderStatus.MATCHING) {
      throw MatchingDomainException.buyOrderNotMatchable();
    }
    if (this.isBuyOrderTimedOut(buyOrder, new Date())) {
      throw MatchingDomainException.buyOrderNotMatchable();
    }

    const policy = await this.findActiveMatchingPolicy(this.dataSource.manager);
    const limit = Math.min(
      query.limit ?? CANDIDATE_DEFAULT_LIMIT,
      CANDIDATE_MAX_LIMIT,
    );
    const cursor = query.cursor
      ? this.decodeCursor(query.cursor)
      : null;

    const summary = await this.countCandidateSummary(
      buyOrder,
      policy.nearMatchMaxRatioBps,
    );

    const rows = await this.queryCandidateRows(
      buyOrder,
      query.type,
      policy.nearMatchMaxRatioBps,
      limit + 1,
      cursor,
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const candidates = pageRows.map((row) =>
      this.toCandidateItem(row, buyOrder.coinAmount, query.type),
    );

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = this.encodeCursor({
        completedTradeCount: Number(last.completed_trade_count),
        createdAt: new Date(last.created_at).toISOString(),
        sellOrderId: last.id,
        absDiff: last.abs_diff,
      });
    }

    return {
      buyOrder: {
        id: buyOrder.id,
        status: buyOrder.status,
        requestedCoinAmount: buyOrder.coinAmount,
      },
      summary: {
        exactCount: summary.exactCount,
        nearCount: summary.nearCount,
        updatedAt: new Date(),
      },
      candidates,
      nextCursor,
    };
  }

  async getMatchingStatus(
    buyerUserId: string,
    orderId: string,
  ): Promise<MatchingStatusResponseDto> {
    const order = await this.buyOrderRepository.findOne({
      where: { id: orderId, buyerUserId },
    });
    if (!order) {
      throw MatchingDomainException.buyOrderNotFound();
    }

    const attemptCount = await this.matchingAttemptRepository.count({
      where: { buyOrderId: order.id },
    });

    let tradeId: string | null = null;
    if (order.status === BuyOrderStatus.MATCHED) {
      const trade = await this.tradeService.findByBuyOrderId(order.id);
      tradeId = trade?.id ?? null;
    }

    let candidateSummary: MatchingStatusResponseDto['candidateSummary'] = null;
    if (order.status === BuyOrderStatus.MATCHING) {
      const policy = await this.findActiveMatchingPolicy(
        this.dataSource.manager,
      );
      candidateSummary = await this.countCandidateSummary(
        order,
        policy.nearMatchMaxRatioBps,
      );
    }

    let tradeRequest: MatchingStatusResponseDto['tradeRequest'] = null;
    if (order.status !== BuyOrderStatus.MATCHING) {
      const pending = await this.tradeRequestRepository.findOne({
        where: {
          buyOrderId: order.id,
          status: TradeRequestStatus.PENDING_SELLER,
        },
      });
      const active =
        pending ??
        (await this.tradeRequestRepository.findOne({
          where: { buyOrderId: order.id },
          order: { createdAt: 'DESC' },
        }));
      if (active) {
        tradeRequest = {
          id: active.id,
          status: active.status,
          expiresAt: active.expiresAt,
        };
      }
    }

    return {
      buyOrderId: order.id,
      orderId: order.id,
      status: order.status,
      attemptCount,
      matched: order.status === BuyOrderStatus.MATCHED,
      tradeId,
      candidateSummary,
      tradeRequest,
    };
  }

  /**
   * Worker용: TTL 만료 MATCHING BuyOrder id 조회.
   * REQUEST_PENDING은 대상이 아님 — Request TTL(expireTradeRequest)만 적용.
   */
  async findExpiredMatchingBuyOrderIds(limit: number): Promise<string[]> {
    const rows = await this.buyOrderRepository
      .createQueryBuilder('o')
      .select('o.id', 'id')
      .where('o.status = :status', { status: BuyOrderStatus.MATCHING })
      .andWhere(
        `o.created_at <= NOW() - (:timeoutSeconds * INTERVAL '1 second')`,
        { timeoutSeconds: BUY_MATCHING_TIMEOUT_SECONDS },
      )
      .orderBy('o.created_at', 'ASC')
      .take(limit)
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  async expireBuyOrder(buyOrderId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BuyOrderEntity);
      const buyOrder = await repository.findOne({
        where: { id: buyOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      // MATCHING만 EXPIRED. REQUEST_PENDING은 Request TTL 전용.
      if (!buyOrder || buyOrder.status !== BuyOrderStatus.MATCHING) {
        return;
      }
      if (!this.isBuyOrderTimedOut(buyOrder, new Date())) {
        return;
      }
      buyOrder.status = BuyOrderStatus.EXPIRED;
      buyOrder.nextMatchableAt = null;
      await repository.save(buyOrder);
    });
  }

  /**
   * Worker용: PENDING_SELLER + expires_at 경과 Request id (ix_trade_requests_expires).
   */
  async findExpiredPendingTradeRequestIds(limit: number): Promise<string[]> {
    const rows = await this.tradeRequestRepository
      .createQueryBuilder('r')
      .select('r.id', 'id')
      .where('r.status = :status', {
        status: TradeRequestStatus.PENDING_SELLER,
      })
      .andWhere('r.expires_at <= NOW()')
      .orderBy('r.expires_at', 'ASC')
      .take(limit)
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /**
   * Request TTL 만료: EXPIRED + release. Accept와 FOR UPDATE 배타.
   */
  async expireTradeRequest(tradeRequestId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tradeRequestRepository = manager.getRepository(TradeRequestEntity);
      const request = await tradeRequestRepository.findOne({
        where: { id: tradeRequestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.status !== TradeRequestStatus.PENDING_SELLER) {
        return;
      }
      if (request.expiresAt.getTime() > Date.now()) {
        return;
      }

      const now = new Date();
      request.status = TradeRequestStatus.EXPIRED;
      request.expiredAt = now;
      await tradeRequestRepository.save(request);

      await this.tradeRequestReservationService.release(manager, request);
    });
  }

  async listAdminAttempts(
    query: SearchMatchingAttemptsDto,
  ): Promise<{ items: AdminMatchingAttemptItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.matchingAttemptRepository.createQueryBuilder('attempt');

    if (query.buyOrderId) {
      qb.andWhere('attempt.buy_order_id = :buyOrderId', {
        buyOrderId: query.buyOrderId,
      });
    }
    if (query.sellOrderId) {
      qb.andWhere('attempt.sell_order_id = :sellOrderId', {
        sellOrderId: query.sellOrderId,
      });
    }
    if (query.result) {
      qb.andWhere('attempt.result = :result', { result: query.result });
    }
    if (query.createdFrom) {
      qb.andWhere('attempt.attempted_at >= :createdFrom', {
        createdFrom: query.createdFrom,
      });
    }
    if (query.createdTo) {
      qb.andWhere('attempt.attempted_at <= :createdTo', {
        createdTo: query.createdTo,
      });
    }

    const [rows, totalItems] = await qb
      .orderBy('attempt.attempted_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      items: rows.map((row) => this.toAdminMatchingAttemptItem(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async listRecentAttemptsByBuyOrderId(
    buyOrderId: string,
    limit = 10,
  ): Promise<AdminMatchingAttemptItemDto[]> {
    const rows = await this.matchingAttemptRepository.find({
      where: { buyOrderId },
      order: { attemptedAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => this.toAdminMatchingAttemptItem(row));
  }

  async listRecentAttemptsBySellOrderId(
    sellOrderId: string,
    limit = 10,
  ): Promise<AdminMatchingAttemptItemDto[]> {
    const rows = await this.matchingAttemptRepository.find({
      where: { sellOrderId },
      order: { attemptedAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => this.toAdminMatchingAttemptItem(row));
  }

  isBuyOrderTimedOut(buyOrder: BuyOrderEntity, now: Date): boolean {
    const expiresAt =
      buyOrder.createdAt.getTime() + BUY_MATCHING_TIMEOUT_SECONDS * 1000;
    return now.getTime() >= expiresAt;
  }

  computeMatch(
    buyAmount: string,
    sellRemaining: string,
    nearMaxRatioBps: number,
  ): { matchType: BuyMatchType; coinAmount: string } | null {
    const buy = BigInt(buyAmount);
    const sell = BigInt(sellRemaining);
    if (sell <= 0n || buy <= 0n) {
      return null;
    }
    if (sell === buy) {
      return { matchType: BuyMatchType.EXACT, coinAmount: sell.toString() };
    }
    const diff = sell > buy ? sell - buy : buy - sell;
    if (diff * 10000n > buy * BigInt(nearMaxRatioBps)) {
      return null;
    }
    return { matchType: BuyMatchType.NEAR, coinAmount: sell.toString() };
  }

  private isSellOrderSelectable(
    sellOrder: SellOrderEntity,
    buyerUserId: string,
  ): boolean {
    if (sellOrder.sellerUserId === buyerUserId) {
      return false;
    }
    if (sellOrder.cancelledAt) {
      return false;
    }
    if (
      sellOrder.status !== SellOrderStatus.OPEN &&
      sellOrder.status !== SellOrderStatus.PARTIALLY_MATCHED
    ) {
      return false;
    }
    return BigInt(sellOrder.remainingCoinAmount) > 0n;
  }

  private async countCandidateSummary(
    buyOrder: BuyOrderEntity,
    nearMaxRatioBps: number,
  ): Promise<{ exactCount: number; nearCount: number }> {
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE so.remaining_coin_amount = $2::bigint
        )::int AS exact_count,
        COUNT(*) FILTER (
          WHERE so.remaining_coin_amount <> $2::bigint
            AND ABS(so.remaining_coin_amount - $2::bigint) * 10000
              <= $2::bigint * $3::bigint
        )::int AS near_count
      FROM sell_orders so
      INNER JOIN users u ON u.id = so.seller_user_id
      INNER JOIN user_bank_accounts uba
        ON uba.user_id = so.seller_user_id
       AND uba.status = $4
      WHERE so.status IN ('OPEN', 'PARTIALLY_MATCHED')
        AND so.remaining_coin_amount > 0
        AND so.cancelled_at IS NULL
        AND so.seller_user_id <> $1
        AND u.status = $5
      `,
      [
        buyOrder.buyerUserId,
        buyOrder.coinAmount,
        nearMaxRatioBps,
        UserBankAccountStatus.ACTIVE,
        UserStatus.ACTIVE,
      ],
    );
    const row = rows[0] as { exact_count: number; near_count: number };
    return {
      exactCount: Number(row?.exact_count ?? 0),
      nearCount: Number(row?.near_count ?? 0),
    };
  }

  private async queryCandidateRows(
    buyOrder: BuyOrderEntity,
    type: BuyMatchType,
    nearMaxRatioBps: number,
    limit: number,
    cursor: CandidateCursor | null,
  ): Promise<CandidateRow[]> {
    const params: unknown[] = [
      buyOrder.buyerUserId,
      buyOrder.coinAmount,
      UserBankAccountStatus.ACTIVE,
      UserStatus.ACTIVE,
      TradeStatus.COMPLETED,
      limit,
    ];

    let amountFilter = '';
    if (type === BuyMatchType.EXACT) {
      amountFilter = `AND so.remaining_coin_amount = $2::bigint`;
    } else {
      params.push(nearMaxRatioBps);
      const nearIdx = params.length;
      amountFilter = `
        AND so.remaining_coin_amount <> $2::bigint
        AND ABS(so.remaining_coin_amount - $2::bigint) * 10000
          <= $2::bigint * $${nearIdx}::bigint
      `;
    }

    let cursorFilter = '';
    if (cursor) {
      if (type === BuyMatchType.EXACT) {
        params.push(
          cursor.completedTradeCount,
          cursor.createdAt,
          cursor.sellOrderId,
        );
        const ctc = params.length - 2;
        const created = params.length - 1;
        const sid = params.length;
        cursorFilter = `
          AND (
            COALESCE(tc.completed_trade_count, 0) < $${ctc}
            OR (
              COALESCE(tc.completed_trade_count, 0) = $${ctc}
              AND so.created_at > $${created}::timestamptz
            )
            OR (
              COALESCE(tc.completed_trade_count, 0) = $${ctc}
              AND so.created_at = $${created}::timestamptz
              AND so.id > $${sid}::uuid
            )
          )
        `;
      } else {
        const absDiff = cursor.absDiff ?? '0';
        params.push(
          absDiff,
          cursor.completedTradeCount,
          cursor.createdAt,
          cursor.sellOrderId,
        );
        const abs = params.length - 3;
        const ctc = params.length - 2;
        const created = params.length - 1;
        const sid = params.length;
        cursorFilter = `
          AND (
            ABS(so.remaining_coin_amount - $2::bigint) > $${abs}::bigint
            OR (
              ABS(so.remaining_coin_amount - $2::bigint) = $${abs}::bigint
              AND COALESCE(tc.completed_trade_count, 0) < $${ctc}
            )
            OR (
              ABS(so.remaining_coin_amount - $2::bigint) = $${abs}::bigint
              AND COALESCE(tc.completed_trade_count, 0) = $${ctc}
              AND so.created_at > $${created}::timestamptz
            )
            OR (
              ABS(so.remaining_coin_amount - $2::bigint) = $${abs}::bigint
              AND COALESCE(tc.completed_trade_count, 0) = $${ctc}
              AND so.created_at = $${created}::timestamptz
              AND so.id > $${sid}::uuid
            )
          )
        `;
      }
    }

    const orderBy =
      type === BuyMatchType.EXACT
        ? `
          ORDER BY COALESCE(tc.completed_trade_count, 0) DESC, so.created_at ASC, so.id ASC
        `
        : `
          ORDER BY
            ABS(so.remaining_coin_amount - $2::bigint) ASC,
            COALESCE(tc.completed_trade_count, 0) DESC,
            so.created_at ASC,
            so.id ASC
        `;

    const sql = `
      SELECT
        so.id,
        so.remaining_coin_amount,
        so.created_at,
        p.nickname,
        COALESCE(tc.completed_trade_count, 0) AS completed_trade_count,
        ABS(so.remaining_coin_amount - $2::bigint)::text AS abs_diff
      FROM sell_orders so
      INNER JOIN users u ON u.id = so.seller_user_id AND u.status = $4
      INNER JOIN user_bank_accounts uba
        ON uba.user_id = so.seller_user_id AND uba.status = $3
      LEFT JOIN user_profiles p ON p.user_id = so.seller_user_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS completed_trade_count
        FROM trades t
        WHERE t.seller_user_id = so.seller_user_id
          AND t.status = $5
      ) tc ON true
      WHERE so.status IN ('OPEN', 'PARTIALLY_MATCHED')
        AND so.remaining_coin_amount > 0
        AND so.cancelled_at IS NULL
        AND so.seller_user_id <> $1
        ${amountFilter}
        ${cursorFilter}
      ${orderBy}
      LIMIT $6
    `;

    return this.dataSource.query(sql, params);
  }

  private toCandidateItem(
    row: CandidateRow,
    buyAmount: string,
    matchType: BuyMatchType,
  ): MatchingCandidateItemDto {
    const sell = BigInt(row.remaining_coin_amount);
    const buy = BigInt(buyAmount);
    return {
      sellOrderId: row.id,
      matchType,
      coinAmount: row.remaining_coin_amount,
      differenceAmount: (sell - buy).toString(),
      seller: {
        nicknameMasked: maskNickname(row.nickname),
        completedTradeCount: Number(row.completed_trade_count),
      },
      createdAt: new Date(row.created_at),
    };
  }

  private encodeCursor(cursor: CandidateCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(raw: string): CandidateCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as CandidateCursor;
      if (
        typeof parsed.completedTradeCount !== 'number' ||
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.sellOrderId !== 'string'
      ) {
        throw new Error('invalid');
      }
      return parsed;
    } catch {
      throw MatchingDomainException.invalidCursor();
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
      throw MatchingDomainException.matchingPolicyNotFound();
    }
    return policy;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  private async allocateTradeCoinLotsFifo(
    manager: EntityManager,
    sellOrderId: string,
    buyAmount: bigint,
  ): Promise<Array<{ coinLotId: string; allocatedAmount: string }>> {
    const lots = await manager.getRepository(SellOrderCoinLotEntity).find({
      where: { sellOrderId },
      order: { createdAt: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    let remainingToAllocate = buyAmount;
    const allocations: Array<{ coinLotId: string; allocatedAmount: string }> =
      [];

    for (const lot of lots) {
      if (remainingToAllocate <= 0n) {
        break;
      }
      const available =
        BigInt(lot.lockedAmount) -
        BigInt(lot.consumedAmount) -
        BigInt(lot.releasedAmount);
      if (available <= 0n) {
        continue;
      }
      const take =
        available < remainingToAllocate ? available : remainingToAllocate;
      allocations.push({
        coinLotId: lot.coinLotId,
        allocatedAmount: take.toString(),
      });
      remainingToAllocate -= take;
    }

    if (remainingToAllocate !== 0n) {
      throw MatchingDomainException.sellOrderChanged();
    }

    return allocations;
  }

  private toAdminMatchingAttemptItem(
    row: MatchingAttemptEntity,
  ): AdminMatchingAttemptItemDto {
    return {
      id: row.id,
      buyOrderId: row.buyOrderId,
      sellOrderId: row.sellOrderId,
      result: row.result,
      tradeId: row.tradeId,
      reasonCode: row.reasonCode,
      attemptedAt: row.attemptedAt,
    };
  }
}
