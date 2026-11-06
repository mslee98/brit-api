import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { buildPaginationMeta } from '../../common/dto/pagination-query.dto';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { TradeDisputeReasonCode } from '../trades/domain/enums/trade-dispute-reason-code.enum';
import { TradeDisputeResolution } from '../trades/domain/enums/trade-dispute-resolution.enum';
import { TradeDisputeStatus } from '../trades/domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../trades/domain/enums/trade-status.enum';
import {
  computeCompletionRatePct,
  faultCancelledTradeSql,
} from '../trades/domain/trade-completion-rate';
import { maskNickname } from '../users/utils/nickname-mask.util';
import { UserProfileEntity } from '../users/infrastructure/entities/user-profile.entity';
import { MarketSellOrderQueryDto } from './dto/market-sell-order-query.dto';
import {
  MarketSellOrderItemDto,
  MarketSellOrderListResponseDto,
  MarketSellerDto,
} from './dto/market-sell-order-response.dto';
import { MarketSummaryResponseDto } from './dto/market-summary-response.dto';

const MARKET_STATUSES = ['OPEN', 'PARTIALLY_MATCHED'] as const;

interface SellerTradeStatsRow {
  user_id: string;
  completed_count: number;
  closed_count: number;
  seller_cancel_count: number;
}

interface SellerDisputeStatsRow {
  user_id: string;
  dispute_count: number;
}

interface SellerStats {
  completedTradeCount: number;
  /** 분모(완료 + 판매자 귀책 취소)=0이면 null — 리스트에 가짜 100%를 쓰지 않음 */
  completionRatePct: number | null;
  disputeCount: number;
  isNewSeller: boolean;
}

/**
 * 거래소 조회 전용 서비스. Read-only.
 * Matching, Coin Lock, Trade 생성 등 상태 변경 로직 없음.
 */
@Injectable()
export class MarketService {
  constructor(
    private readonly dataSource: DataSource,
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

  /** 판매자 본인이 거래소 카드에 어떻게 보이는지 (내 판매 화면 미리보기) */
  async getMySellerProfile(userId: string): Promise<MarketSellerDto> {
    const [profile, statsMap] = await Promise.all([
      this.userProfileRepository.findOne({
        select: { userId: true, nickname: true },
        where: { userId },
      }),
      this.loadSellerStatsMap([userId]),
    ]);
    const stats = statsMap.get(userId) ?? emptySellerStats();
    return {
      nickname: maskNickname(profile?.nickname ?? null),
      completedTradeCount: stats.completedTradeCount,
      completionRatePct: stats.completionRatePct,
      disputeCount: stats.disputeCount,
      isNewSeller: stats.isNewSeller,
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
    const uniqueSellerIds = [...new Set(sellerIds)];

    const [profiles, statsMap] = await Promise.all([
      this.userProfileRepository
        .createQueryBuilder('p')
        .select(['p.userId', 'p.nickname'])
        .whereInIds(uniqueSellerIds)
        .getMany(),
      this.loadSellerStatsMap(uniqueSellerIds),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.userId, p.nickname]));

    const items: MarketSellOrderItemDto[] = rows.map((row) => {
      const stats = statsMap.get(row.sellerUserId) ?? emptySellerStats();
      const seller: MarketSellerDto = {
        nickname: maskNickname(profileMap.get(row.sellerUserId) ?? null),
        completedTradeCount: stats.completedTradeCount,
        completionRatePct: stats.completionRatePct,
        disputeCount: stats.disputeCount,
        isNewSeller: stats.isNewSeller,
      };
      return {
        sellOrderId: row.id,
        seller,
        remainingCoinAmount: row.remainingCoinAmount,
        minimumTradeAmount: row.minimumTradeAmount,
        createdAt: row.createdAt,
      };
    });

    return {
      items,
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  /**
   * 판매자 신뢰 요약 (판매자 역할 거래만, 페이지 seller 일괄).
   *
   * - completedTradeCount: COMPLETED (분쟁 강제 완료 포함)
   * - completionRatePct: completed / (completed + 판매자 귀책 취소).
   *   판매자 귀책 취소 = 입금 전(WAITING_BUYER_PAYMENT)에 판매자가 취소한 거래.
   *   구매자 입금 전 취소·미입금 확정(PAYMENT_TIMEOUT→)·합의 취소·분쟁 강제 취소는 분모에서 제외.
   *   분모 0이면 null.
   * - disputeCount: 판매자 귀책 분쟁. 철회(CANCELLED) 제외.
   *   SELLER_NO_CONFIRM / SELLER_CONFIRMATION_TIMEOUT (강제 취소 = 구매자 미입금 판정은 제외)
   *   + 판매자가 연 NOT_RECEIVED 중 강제 완료(실제 입금) 판정.
   * - isNewSeller: 종료 거래(완료+취소) 0건.
   */
  private async loadSellerStatsMap(
    sellerIds: string[],
  ): Promise<Map<string, SellerStats>> {
    const map = new Map<string, SellerStats>();
    if (sellerIds.length === 0) return map;

    for (const id of sellerIds) {
      map.set(id, emptySellerStats());
    }

    const [tradeRows, disputeRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          t.seller_user_id AS user_id,
          COUNT(*) FILTER (WHERE t.status = $2)::int AS completed_count,
          COUNT(*) FILTER (WHERE t.status IN ($2, $3))::int AS closed_count,
          COUNT(*) FILTER (
            WHERE ${faultCancelledTradeSql('t', 'SELLER')}
          )::int AS seller_cancel_count
        FROM trades t
        WHERE t.seller_user_id = ANY($1::uuid[])
        GROUP BY t.seller_user_id
        `,
        [sellerIds, TradeStatus.COMPLETED, TradeStatus.CANCELLED],
      ) as Promise<SellerTradeStatsRow[]>,
      this.dataSource.query(
        `
        SELECT
          t.seller_user_id AS user_id,
          COUNT(*)::int AS dispute_count
        FROM trade_disputes d
        INNER JOIN trades t ON t.id = d.trade_id
        WHERE t.seller_user_id = ANY($1::uuid[])
          AND d.status <> $2
          AND (
            (
              d.reason_code IN ($3, $4)
              AND d.resolution IS DISTINCT FROM $5
            )
            OR (d.reason_code = $6 AND d.resolution = $7)
          )
        GROUP BY t.seller_user_id
        `,
        [
          sellerIds,
          TradeDisputeStatus.CANCELLED,
          TradeDisputeReasonCode.SELLER_NO_CONFIRM,
          TradeDisputeReasonCode.SELLER_CONFIRMATION_TIMEOUT,
          TradeDisputeResolution.FORCE_CANCEL,
          TradeDisputeReasonCode.NOT_RECEIVED,
          TradeDisputeResolution.FORCE_COMPLETE,
        ],
      ) as Promise<SellerDisputeStatsRow[]>,
    ]);

    for (const row of tradeRows) {
      const completedTradeCount = Number(row.completed_count ?? 0);
      const closedCount = Number(row.closed_count ?? 0);
      const completionRatePct = computeCompletionRatePct(
        completedTradeCount,
        Number(row.seller_cancel_count ?? 0),
      );
      const prev = map.get(row.user_id) ?? emptySellerStats();
      map.set(row.user_id, {
        ...prev,
        completedTradeCount,
        completionRatePct,
        isNewSeller: closedCount === 0,
      });
    }

    for (const row of disputeRows) {
      const prev = map.get(row.user_id) ?? emptySellerStats();
      map.set(row.user_id, {
        ...prev,
        disputeCount: Number(row.dispute_count ?? 0),
      });
    }

    return map;
  }
}

function emptySellerStats(): SellerStats {
  return {
    completedTradeCount: 0,
    completionRatePct: null,
    disputeCount: 0,
    isNewSeller: true,
  };
}
