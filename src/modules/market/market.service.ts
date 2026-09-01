import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  buildPaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { UserProfileEntity } from '../users/infrastructure/entities/user-profile.entity';
import { maskNickname } from '../trades/utils/nickname-mask.util';
import { MarketSellOrderQueryDto } from './dto/market-sell-order-query.dto';
import {
  MarketSellOrderItemDto,
  MarketSellOrderListResponseDto,
} from './dto/market-sell-order-response.dto';
import { MarketSummaryResponseDto } from './dto/market-summary-response.dto';

const MARKET_STATUSES = ['OPEN', 'PARTIALLY_MATCHED'] as const;

/**
 * 거래소 조회 전용 서비스. Read-only.
 * Matching, Coin Lock, Trade 생성 등 상태 변경 로직 없음.
 */
@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(SellOrderEntity)
    private readonly sellOrderRepository: Repository<SellOrderEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly userProfileRepository: Repository<UserProfileEntity>,
  ) {}

  async getSummary(): Promise<MarketSummaryResponseDto> {
    const result = await this.sellOrderRepository
      .createQueryBuilder('so')
      .select('COUNT(so.id)', 'count')
      .addSelect('COALESCE(SUM(so.remaining_coin_amount), 0)', 'totalAmount')
      .where('so.status IN (:...statuses)', { statuses: MARKET_STATUSES })
      .andWhere('so.remaining_coin_amount > 0')
      .andWhere('so.cancelled_at IS NULL')
      .getRawOne<{ count: string; totalAmount: string }>();

    return {
      availableSellOrderCount: Number(result?.count ?? 0),
      availableCoinAmount: result?.totalAmount ?? '0',
    };
  }

  async listSellOrders(
    query: MarketSellOrderQueryDto,
  ): Promise<MarketSellOrderListResponseDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const qb = this.sellOrderRepository
      .createQueryBuilder('so')
      .where('so.status IN (:...statuses)', { statuses: MARKET_STATUSES })
      .andWhere('so.remaining_coin_amount > 0')
      .andWhere('so.cancelled_at IS NULL');

    if (query.minAmount !== undefined) {
      qb.andWhere('so.remaining_coin_amount >= :minAmount', {
        minAmount: query.minAmount.toString(),
      });
    }
    if (query.maxAmount !== undefined) {
      qb.andWhere('so.remaining_coin_amount <= :maxAmount', {
        maxAmount: query.maxAmount.toString(),
      });
    }

    const [rows, totalItems] = await qb
      .orderBy('so.created_at', 'ASC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    if (rows.length === 0) {
      return {
        items: [],
        pagination: buildPaginationMeta(page, size, totalItems),
      };
    }

    const sellerIds = rows.map((r) => r.sellerUserId);
    const profiles = await this.userProfileRepository
      .createQueryBuilder('p')
      .select(['p.userId', 'p.nickname'])
      .whereInIds(sellerIds)
      .getMany();

    const profileMap = new Map(profiles.map((p) => [p.userId, p.nickname]));

    const items: MarketSellOrderItemDto[] = rows.map((row) => ({
      sellOrderId: row.id,
      seller: {
        nickname: maskNickname(profileMap.get(row.sellerUserId) ?? null),
      },
      remainingCoinAmount: row.remainingCoinAmount,
      minimumTradeAmount: row.minimumTradeAmount,
      createdAt: row.createdAt,
    }));

    return {
      items,
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }
}
