import { Inject, Injectable, OnModuleInit, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { CoinService } from '../coins/coin.service';
import { TradeRequestResponseDto } from '../matching/dto/matching-response.dto';
import { MatchingService } from '../matching/matching.service';
import { UserProfileEntity } from '../users/infrastructure/entities/user-profile.entity';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { UserService } from '../users/user.service';
import { SellOrderStatus } from './domain/enums/sell-order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  AdminSellOrderCoinLotItemDto,
  AdminSellOrderDetailDto,
  AdminSellOrderListItemDto,
  SearchAdminSellOrdersDto,
} from './dto/admin-order-list-response.dto';
import {
  SearchAdminOrdersDto,
  SearchSellOrdersDto,
  AdminOrderListItemDto,
  AdminOrderSide,
} from './dto/search-orders.dto';
import {
  SellOrderResponseDto,
} from './dto/sell-order-response.dto';
import { OrderDomainException } from './exceptions/order.exceptions';
import { MatchingPolicyEntity } from './infrastructure/entities/matching-policy.entity';
import { SellOrderCoinLotEntity } from './infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from './infrastructure/entities/sell-order.entity';
import { OrderRealtimePublisher } from './realtime/order-realtime.publisher';
import { nextOrderNumber } from './utils/order-number.util';
import { addAmount } from '../coins/utils/coin-amount.util';
import { isPositiveAmountString } from '../coins/utils/coin-amount.util';

/**
 * 판매 주문 생성·취소·조회.
 * 생성 시 sellable 전액을 Lot/Wallet Lock한다.
 */
@Injectable()
export class SellOrderService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly coinService: CoinService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => MatchingService))
    private readonly matchingService: MatchingService,
    @InjectRepository(SellOrderEntity)
    private readonly sellOrderRepository: Repository<SellOrderEntity>,
    @InjectRepository(SellOrderCoinLotEntity)
    private readonly sellOrderCoinLotRepository: Repository<SellOrderCoinLotEntity>,
    @InjectRepository(MatchingPolicyEntity)
    private readonly matchingPolicyRepository: Repository<MatchingPolicyEntity>,
    private readonly orderRealtime: OrderRealtimePublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    const active = await this.matchingPolicyRepository.findOne({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC' },
    });
    if (!active) {
      await this.matchingPolicyRepository.save(
        this.matchingPolicyRepository.create({
          minSplitRatioBps: 2000,
          buyerPaymentTimeoutSeconds: 300,
          sellerConfirmationTimeoutSeconds: 180,
          maxRematchCount: 3,
          nearMatchMaxRatioBps: 1000,
          isActive: true,
          effectiveFrom: new Date(),
          createdByUserId: null,
        }),
      );
    }
  }

  async createSellOrder(
    sellerUserId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<SellOrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw OrderDomainException.idempotencyKeyRequired();
    }
    if (!isPositiveAmountString(dto.coinAmount)) {
      throw OrderDomainException.invalidOrderAmount();
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(SellOrderEntity).findOne({
        where: {
          sellerUserId,
          idempotencyKey: idempotencyKey.trim(),
        },
      });
      if (existing) {
        if (existing.originalCoinAmount !== dto.coinAmount) {
          throw OrderDomainException.duplicateOrderRequest();
        }
        return SellOrderResponseDto.from(existing);
      }

      await this.userService.assertP2pEligibleInTransaction(
        manager,
        sellerUserId,
      );

      const policy = await this.findActivePolicy(manager);
      const minimumTradeAmount = this.computeMinimumTradeAmount(
        dto.coinAmount,
        policy.minSplitRatioBps,
      );

      const orderId = randomUUID();
      const allocations = await this.coinService.lockSellableInTransaction(
        manager,
        {
          userId: sellerUserId,
          amount: dto.coinAmount,
          referenceType: 'SELL_ORDER',
          referenceId: orderId,
          description: null,
        },
      );

      const orderRepository = manager.getRepository(SellOrderEntity);
      const orderNumber = await nextOrderNumber(manager, 'SO');
      const order = orderRepository.create({
        id: orderId,
        orderNumber,
        sellerUserId,
        matchingPolicyId: policy.id,
        originalCoinAmount: dto.coinAmount,
        remainingCoinAmount: dto.coinAmount,
        reservedCoinAmount: '0',
        completedCoinAmount: '0',
        cancelledCoinAmount: '0',
        minimumTradeAmount,
        minSplitRatioBpsSnapshot: policy.minSplitRatioBps,
        status: SellOrderStatus.OPEN,
        idempotencyKey: idempotencyKey.trim(),
        completedAt: null,
        cancelledAt: null,
      });
      const saved = await orderRepository.save(order);

      const allocRepository = manager.getRepository(SellOrderCoinLotEntity);
      for (const alloc of allocations) {
        await allocRepository.save(
          allocRepository.create({
            sellOrderId: saved.id,
            coinLotId: alloc.coinLotId,
            lockedAmount: alloc.lockedAmount,
            consumedAmount: '0',
            releasedAmount: '0',
          }),
        );
      }

      return SellOrderResponseDto.from(saved);
    });
    this.orderRealtime.publishSellOrder(created.id);
    this.orderRealtime.publishMatchingChanged();
    return created;
  }

  async cancelSellOrder(
    sellerUserId: string,
    orderId: string,
  ): Promise<SellOrderResponseDto> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(SellOrderEntity);
      const order = await orderRepository.findOne({
        where: { id: orderId, sellerUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw OrderDomainException.sellOrderNotFound();
      }
      if (order.cancelledAt) {
        throw OrderDomainException.orderAlreadyCancelled();
      }
      if (order.status === SellOrderStatus.COMPLETED) {
        throw OrderDomainException.orderNotCancellable();
      }

      const unlockAmount = order.remainingCoinAmount;
      if (BigInt(unlockAmount) <= 0n) {
        throw OrderDomainException.orderNotCancellable();
      }

      const allocRepository = manager.getRepository(SellOrderCoinLotEntity);
      const allocations = await allocRepository.find({
        where: { sellOrderId: order.id },
        order: { createdAt: 'ASC', coinLotId: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      const releaseTargets = allocations.map((row) => {
        const available = (
          BigInt(row.lockedAmount) -
          BigInt(row.consumedAmount) -
          BigInt(row.releasedAmount)
        ).toString();
        return {
          coinLotId: row.coinLotId,
          availableToRelease: available,
          entity: row,
        };
      });

      const released = await this.coinService.releaseSellableInTransaction(
        manager,
        {
          userId: sellerUserId,
          amount: unlockAmount,
          allocations: releaseTargets.map((t) => ({
            coinLotId: t.coinLotId,
            availableToRelease: t.availableToRelease,
          })),
          referenceType: 'SELL_ORDER',
          referenceId: order.id,
          description: null,
        },
      );

      const releasedByLot = new Map(
        released.map((r) => [r.coinLotId, r.releasedAmount]),
      );
      for (const target of releaseTargets) {
        const amount = releasedByLot.get(target.coinLotId);
        if (!amount) {
          continue;
        }
        target.entity.releasedAmount = addAmount(
          target.entity.releasedAmount,
          amount,
        );
        await allocRepository.save(target.entity);
      }

      order.cancelledCoinAmount = addAmount(
        order.cancelledCoinAmount ?? '0',
        unlockAmount,
      );
      order.remainingCoinAmount = '0';
      order.cancelledAt = new Date();
      order.status = SellOrderStatus.CANCELLED;
      const saved = await orderRepository.save(order);
      return SellOrderResponseDto.from(saved);
    });
    this.orderRealtime.publishSellOrder(orderId);
    this.orderRealtime.publishMatchingChanged();
    return cancelled;
  }

  async listMySellOrders(
    sellerUserId: string,
    query: SearchSellOrdersDto,
  ): Promise<{ items: SellOrderResponseDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: { sellerUserId: string; status?: SellOrderStatus } = {
      sellerUserId,
    };
    if (query.status) {
      where.status = query.status;
    }

    const [rows, totalItems] = await this.sellOrderRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => SellOrderResponseDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getMySellOrder(
    sellerUserId: string,
    orderId: string,
  ): Promise<SellOrderResponseDto> {
    const order = await this.sellOrderRepository.findOne({
      where: { id: orderId, sellerUserId },
    });
    if (!order) {
      throw OrderDomainException.sellOrderNotFound();
    }
    return SellOrderResponseDto.from(order);
  }

  async getMySellOrderPendingRequest(
    sellerUserId: string,
    orderId: string,
  ): Promise<TradeRequestResponseDto | null> {
    const order = await this.sellOrderRepository.findOne({
      where: { id: orderId, sellerUserId },
    });
    if (!order) {
      throw OrderDomainException.sellOrderNotFound();
    }
    return this.matchingService.findPendingBySellOrder(sellerUserId, orderId);
  }

  async getAdminSellOrder(orderId: string): Promise<AdminSellOrderDetailDto> {
    const order = await this.sellOrderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw OrderDomainException.sellOrderNotFound();
    }

    const [parties, matchingAttempts] = await Promise.all([
      this.userService.getAdminPartySummaries([order.sellerUserId]),
      this.matchingService.listRecentAttemptsBySellOrderId(order.id),
    ]);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      seller: this.userService.toAdminPartyDto(parties.get(order.sellerUserId)),
      originalCoinAmount: order.originalCoinAmount,
      remainingCoinAmount: order.remainingCoinAmount,
      reservedCoinAmount: order.reservedCoinAmount,
      completedCoinAmount: order.completedCoinAmount,
      cancelledCoinAmount: order.cancelledCoinAmount,
      minimumTradeAmount: order.minimumTradeAmount,
      minSplitRatioBpsSnapshot: order.minSplitRatioBpsSnapshot,
      status: order.status,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      matchingAttempts,
    };
  }

  async getAdminSellOrderCoinLots(
    orderId: string,
  ): Promise<AdminSellOrderCoinLotItemDto[]> {
    const order = await this.sellOrderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw OrderDomainException.sellOrderNotFound();
    }

    const allocations = await this.sellOrderCoinLotRepository.find({
      where: { sellOrderId: order.id },
      relations: ['coinLot'],
      order: { createdAt: 'ASC' },
    });

    return allocations.map((row) => ({
      coinLotId: row.coinLotId,
      sourceType: row.coinLot?.sourceType ?? null,
      lockedAmount: row.lockedAmount,
      consumedAmount: row.consumedAmount,
      releasedAmount: row.releasedAmount,
    }));
  }

  async searchAdminSellOrders(
    query: SearchAdminSellOrdersDto,
  ): Promise<{ items: AdminSellOrderListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.sellOrderRepository.createQueryBuilder('order');

    if (query.sellerUserId) {
      qb.andWhere('order.seller_user_id = :sellerUserId', {
        sellerUserId: query.sellerUserId,
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
      qb.leftJoin(
        UserEntity,
        'seller_user',
        'seller_user.id = order.seller_user_id',
      )
        .leftJoin(
          UserProfileEntity,
          'seller_profile',
          'seller_profile.user_id = order.seller_user_id',
        )
        .andWhere(
          `(
            order.order_number ILIKE :like
            OR seller_user.login_id ILIKE :like
            OR seller_profile.name ILIKE :like
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
      rows.map((row) => row.sellerUserId),
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        seller: this.userService.toAdminPartyDto(parties.get(row.sellerUserId)),
        originalCoinAmount: row.originalCoinAmount,
        remainingCoinAmount: row.remainingCoinAmount,
        reservedCoinAmount: row.reservedCoinAmount,
        completedCoinAmount: row.completedCoinAmount,
        cancelledCoinAmount: row.cancelledCoinAmount,
        minimumTradeAmount: row.minimumTradeAmount,
        status: row.status,
        createdAt: row.createdAt,
      })),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async listAdminSellOrdersForMerge(
    query: SearchAdminOrdersDto,
  ): Promise<AdminOrderListItemDto[]> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    // 병합을 위해 넉넉히 가져간 뒤 AdminOrdersService에서 정렬·슬라이스
    const take = page * size;
    const rows = await this.sellOrderRepository.find({
      order: { createdAt: 'DESC' },
      take,
    });
    return rows.map((row) => ({
      side: AdminOrderSide.SELL,
      id: row.id,
      orderNumber: row.orderNumber,
      userId: row.sellerUserId,
      coinAmount: row.originalCoinAmount,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  private async findActivePolicy(
    manager: EntityManager,
  ): Promise<MatchingPolicyEntity> {
    const policy = await manager.getRepository(MatchingPolicyEntity).findOne({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC' },
    });
    if (!policy) {
      throw OrderDomainException.matchingPolicyNotFound();
    }
    return policy;
  }

  private computeMinimumTradeAmount(
    originalAmount: string,
    minSplitRatioBps: number,
  ): string {
    const minimum =
      (BigInt(originalAmount) * BigInt(minSplitRatioBps)) / 10000n;
    if (minimum < 1n) {
      throw OrderDomainException.sellOrderMinimumTradeInvalid();
    }
    return minimum.toString();
  }
}
