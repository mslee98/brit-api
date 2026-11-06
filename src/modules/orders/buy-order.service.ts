import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { TradeRequestOrigin } from '../matching/domain/enums/trade-request-origin.enum';
import { MatchingService } from '../matching/matching.service';
import {
  ApplyBuyOrderDto,
  CreateMarketTradeRequestDto,
  MatchBuyOrderDto,
  MatchBuyOrderResponseDto,
  ApplyBuyOrderResponseDto,
  MatchingCandidatesResponseDto,
  MatchingStatusResponseDto,
  SearchMatchingCandidatesDto,
} from '../matching/dto/matching-response.dto';
import { UserProfileEntity } from '../users/infrastructure/entities/user-profile.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { UserService } from '../users/user.service';
import { BuyMatchType } from './domain/enums/buy-match-type.enum';
import { BuyOrderStatus } from './domain/enums/buy-order-status.enum';
import {
  AdminBuyOrderDetailDto,
  AdminBuyOrderListItemDto,
  SearchAdminBuyOrdersDto,
} from './dto/admin-order-list-response.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { BuyOrderResponseDto } from './dto/buy-order-response.dto';
import {
  AdminOrderListItemDto,
  AdminOrderSide,
  SearchAdminOrdersDto,
  SearchBuyOrdersDto,
} from './dto/search-orders.dto';
import { OrderDomainException } from './exceptions/order.exceptions';
import { BuyOrderEntity } from './infrastructure/entities/buy-order.entity';
import { OrderRealtimePublisher } from './realtime/order-realtime.publisher';
import { nextOrderNumber } from './utils/order-number.util';
import { isPositiveAmountString } from '../coins/utils/coin-amount.util';

/**
 * 구매 탐색 세션 생성·취소·조회.
 * Trade 즉시 생성: MatchingService.selectMatch.
 * 판매자 수락 신청: MatchingService.applyToSellOrder.
 */
@Injectable()
export class BuyOrderService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    @Inject(forwardRef(() => MatchingService))
    private readonly matchingService: MatchingService,
    @InjectRepository(BuyOrderEntity)
    private readonly buyOrderRepository: Repository<BuyOrderEntity>,
    private readonly orderRealtime: OrderRealtimePublisher,
  ) {}

  async createBuyOrder(
    buyerUserId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<BuyOrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw OrderDomainException.idempotencyKeyRequired();
    }
    if (!isPositiveAmountString(dto.coinAmount)) {
      throw OrderDomainException.invalidOrderAmount();
    }

    const saved = await this.dataSource.transaction((manager) =>
      this.createBuyOrderInTransaction(
        manager,
        buyerUserId,
        dto.coinAmount,
        idempotencyKey,
      ),
    );

    this.orderRealtime.publishBuyOrder(saved.id);
    return BuyOrderResponseDto.from(saved);
  }

  /**
   * 거래소 판매글 요청 — BuyOrder 생성과 Apply(origin MARKET)를 한 트랜잭션으로.
   * Apply가 실패하면 BuyOrder도 남지 않는다. 같은 Idempotency-Key 재시도는 기존 요청을 돌려준다.
   */
  async requestFromMarket(
    buyerUserId: string,
    dto: CreateMarketTradeRequestDto,
    idempotencyKey: string,
  ): Promise<ApplyBuyOrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw OrderDomainException.idempotencyKeyRequired();
    }
    if (!isPositiveAmountString(dto.expectedCoinAmount)) {
      throw OrderDomainException.invalidOrderAmount();
    }

    const applied = await this.dataSource.transaction(async (manager) => {
      const buyOrder = await this.createBuyOrderInTransaction(
        manager,
        buyerUserId,
        dto.expectedCoinAmount,
        idempotencyKey,
      );
      return this.matchingService.applyToSellOrderInTransaction(
        manager,
        buyerUserId,
        buyOrder.id,
        {
          sellOrderId: dto.sellOrderId,
          expectedMatchType: BuyMatchType.EXACT,
          expectedCoinAmount: dto.expectedCoinAmount,
          origin: TradeRequestOrigin.MARKET,
        },
        idempotencyKey,
      );
    });

    this.orderRealtime.publishBuyOrder(applied.buyOrderId);
    this.matchingService.publishTradeRequestApplied(applied.tradeRequestId);
    return applied;
  }

  private async createBuyOrderInTransaction(
    manager: EntityManager,
    buyerUserId: string,
    coinAmount: string,
    idempotencyKey: string,
  ): Promise<BuyOrderEntity> {
    const key = idempotencyKey.trim();
    const orderRepository = manager.getRepository(BuyOrderEntity);
    const existing = await orderRepository.findOne({
      where: { buyerUserId, idempotencyKey: key },
    });
    if (existing) {
      if (existing.coinAmount !== coinAmount) {
        throw OrderDomainException.duplicateOrderRequest();
      }
      return existing;
    }

    await this.userService.assertP2pEligibleInTransaction(manager, buyerUserId);

    const orderNumber = await nextOrderNumber(manager, 'BO');
    const order = orderRepository.create({
      orderNumber,
      buyerUserId,
      coinAmount,
      matchedCoinAmount: null,
      matchType: null,
      status: BuyOrderStatus.MATCHING,
      rematchCount: 0,
      nextMatchableAt: null,
      idempotencyKey: key,
      matchedAt: null,
      completedAt: null,
      cancelledAt: null,
    });
    return orderRepository.save(order);
  }

  async getMatchingStatus(
    buyerUserId: string,
    orderId: string,
  ): Promise<MatchingStatusResponseDto> {
    return this.matchingService.getMatchingStatus(buyerUserId, orderId);
  }

  async listCandidates(
    buyerUserId: string,
    orderId: string,
    query: SearchMatchingCandidatesDto,
  ): Promise<MatchingCandidatesResponseDto> {
    return this.matchingService.listCandidates(buyerUserId, orderId, query);
  }

  async selectMatch(
    buyerUserId: string,
    orderId: string,
    dto: MatchBuyOrderDto,
  ): Promise<MatchBuyOrderResponseDto> {
    return this.matchingService.selectMatch(buyerUserId, orderId, dto);
  }

  async applyToSellOrder(
    buyerUserId: string,
    orderId: string,
    dto: ApplyBuyOrderDto,
    idempotencyKey: string,
  ): Promise<ApplyBuyOrderResponseDto> {
    return this.matchingService.applyToSellOrder(
      buyerUserId,
      orderId,
      dto,
      idempotencyKey,
    );
  }

  async cancelBuyOrder(
    buyerUserId: string,
    orderId: string,
  ): Promise<BuyOrderResponseDto> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(BuyOrderEntity);
      const order = await orderRepository.findOne({
        where: { id: orderId, buyerUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw OrderDomainException.buyOrderNotFound();
      }
      if (order.status === BuyOrderStatus.CANCELLED || order.cancelledAt) {
        throw OrderDomainException.orderAlreadyCancelled();
      }
      if (order.status === BuyOrderStatus.MATCHED) {
        throw OrderDomainException.orderAlreadyMatched();
      }
      if (order.status !== BuyOrderStatus.MATCHING) {
        throw OrderDomainException.orderNotCancellable();
      }

      order.status = BuyOrderStatus.CANCELLED;
      order.cancelledAt = new Date();
      const saved = await orderRepository.save(order);
      return BuyOrderResponseDto.from(saved);
    });
    this.orderRealtime.publishBuyOrder(orderId);
    return cancelled;
  }

  async listMyBuyOrders(
    buyerUserId: string,
    query: SearchBuyOrdersDto,
  ): Promise<{ items: BuyOrderResponseDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: { buyerUserId: string; status?: BuyOrderStatus } = {
      buyerUserId,
    };
    if (query.status) {
      where.status = query.status;
    }

    const [rows, totalItems] = await this.buyOrderRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => BuyOrderResponseDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getMyBuyOrder(
    buyerUserId: string,
    orderId: string,
  ): Promise<BuyOrderResponseDto> {
    const order = await this.buyOrderRepository.findOne({
      where: { id: orderId, buyerUserId },
    });
    if (!order) {
      throw OrderDomainException.buyOrderNotFound();
    }
    return BuyOrderResponseDto.from(order);
  }

  async getAdminBuyOrder(orderId: string): Promise<AdminBuyOrderDetailDto> {
    const order = await this.buyOrderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw OrderDomainException.buyOrderNotFound();
    }

    const [parties, matchingAttempts] = await Promise.all([
      this.userService.getAdminPartySummaries([order.buyerUserId]),
      this.matchingService.listRecentAttemptsByBuyOrderId(order.id),
    ]);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      buyer: this.userService.toAdminPartyDto(parties.get(order.buyerUserId)),
      coinAmount: order.coinAmount,
      status: order.status,
      rematchCount: order.rematchCount,
      nextMatchableAt: order.nextMatchableAt,
      matchedAt: order.matchedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      matchingAttempts,
    };
  }

  async searchAdminBuyOrders(
    query: SearchAdminBuyOrdersDto,
  ): Promise<{ items: AdminBuyOrderListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.buyOrderRepository.createQueryBuilder('order');

    if (query.buyerUserId) {
      qb.andWhere('order.buyer_user_id = :buyerUserId', {
        buyerUserId: query.buyerUserId,
      });
    }
    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.createdFrom) {
      qb.andWhere('order.created_at >= :createdFrom', {
        createdFrom: query.createdFrom,
      });
    }
    if (query.createdTo) {
      qb.andWhere('order.created_at <= :createdTo', {
        createdTo: query.createdTo,
      });
    }
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      qb.leftJoin(UserEntity, 'buyer_user', 'buyer_user.id = order.buyer_user_id')
        .leftJoin(
          UserProfileEntity,
          'buyer_profile',
          'buyer_profile.user_id = order.buyer_user_id',
        )
        .andWhere(
          `(
            order.order_number ILIKE :like
            OR buyer_user.login_id ILIKE :like
            OR buyer_profile.name ILIKE :like
          )`,
          { like: `%${keyword}%` },
        );
    }

    const [rows, totalItems] = await qb
      .orderBy('order.created_at', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const parties = await this.userService.getAdminPartySummaries(
      rows.map((row) => row.buyerUserId),
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        buyer: this.userService.toAdminPartyDto(parties.get(row.buyerUserId)),
        coinAmount: row.coinAmount,
        status: row.status,
        rematchCount: row.rematchCount,
        matchedAt: row.matchedAt,
        createdAt: row.createdAt,
      })),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async listAdminBuyOrdersForMerge(
    query: SearchAdminOrdersDto,
  ): Promise<AdminOrderListItemDto[]> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const take = page * size;
    const rows = await this.buyOrderRepository.find({
      order: { createdAt: 'DESC' },
      take,
    });
    return rows.map((row) => ({
      side: AdminOrderSide.BUY,
      id: row.id,
      orderNumber: row.orderNumber,
      userId: row.buyerUserId,
      coinAmount: row.coinAmount,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }
}
