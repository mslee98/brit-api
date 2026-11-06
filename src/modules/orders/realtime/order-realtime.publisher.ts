import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Server } from 'socket.io';
import { Repository } from 'typeorm';

import { buyRangeForSell } from '../../matching/domain/near-match-range';
import { TradeRequestEntity } from '../../matching/infrastructure/entities/trade-request.entity';
import { BuyOrderStatus } from '../domain/enums/buy-order-status.enum';
import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';
import { BuyOrderEntity } from '../infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../infrastructure/entities/matching-policy.entity';
import { SellOrderEntity } from '../infrastructure/entities/sell-order.entity';
import {
  buyOrderRoom,
  ORDER_WS_EVENTS,
  orderUserRoom,
} from './order-realtime.constants';

const MATCHING_SIGNAL_WINDOW_MS = 300;
const MATCHING_SIGNAL_PRUNE_SIZE = 2000;

/** remaining '0' = 더 이상 후보가 아님(예약·취소·체결). 클라이언트는 목록에서 바로 뺀다 */
type MatchingSellChange = { sellOrderId: string; remaining: string };

/**
 * 주문·신청 커밋 후 user room 신호. 화면 본문은 REST.
 * 후보 변경은 바뀐 판매 금액이 NEAR 범위에 드는 MATCHING 구매의 buy-order room에만 보낸다.
 * 단일 인스턴스 기준(in-memory 합치기). 다중 인스턴스는 Redis adapter 전제.
 */
@Injectable()
export class OrderRealtimePublisher {
  private readonly logger = new Logger(OrderRealtimePublisher.name);
  private server: Server | null = null;
  private readonly matchingLastSignalAt = new Map<string, number>();
  private readonly matchingPending = new Map<
    string,
    Map<string, MatchingSellChange>
  >();
  private matchingFlushTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(BuyOrderEntity)
    private readonly buyOrderRepository: Repository<BuyOrderEntity>,
    @InjectRepository(SellOrderEntity)
    private readonly sellOrderRepository: Repository<SellOrderEntity>,
    @InjectRepository(TradeRequestEntity)
    private readonly tradeRequestRepository: Repository<TradeRequestEntity>,
    @InjectRepository(MatchingPolicyEntity)
    private readonly matchingPolicyRepository: Repository<MatchingPolicyEntity>,
  ) {}

  attach(server: Server): void {
    this.server = server;
  }

  publishBuyOrder(buyOrderId: string): void {
    void this.buyOrderRepository
      .findOne({
        where: { id: buyOrderId },
        select: { id: true, buyerUserId: true, status: true },
      })
      .then((order) => {
        if (!order || !this.server) return;
        this.server
          .to(orderUserRoom(order.buyerUserId))
          .emit(ORDER_WS_EVENTS.BUY_UPDATED, {
            buyOrderId: order.id,
            status: order.status,
          });
      })
      .catch((error: unknown) => this.warn('buy', buyOrderId, error));
  }

  publishSellOrder(sellOrderId: string): void {
    void this.sellOrderRepository
      .findOne({
        where: { id: sellOrderId },
        select: { id: true, sellerUserId: true, status: true },
      })
      .then((order) => {
        if (!order || !this.server) return;
        this.server
          .to(orderUserRoom(order.sellerUserId))
          .emit(ORDER_WS_EVENTS.SELL_UPDATED, {
            sellOrderId: order.id,
            status: order.status,
          });
      })
      .catch((error: unknown) => this.warn('sell', sellOrderId, error));
  }

  publishTradeRequest(tradeRequestId: string): void {
    void this.tradeRequestRepository
      .findOne({ where: { id: tradeRequestId } })
      .then((request) => {
        if (!request || !this.server) return;
        const payload = {
          requestId: request.id,
          sellOrderId: request.sellOrderId,
          buyOrderId: request.buyOrderId,
          status: request.status,
        };
        const event = ORDER_WS_EVENTS.REQUEST_UPDATED;
        this.server.to(orderUserRoom(request.buyerUserId)).emit(event, payload);
        this.server
          .to(orderUserRoom(request.sellerUserId))
          .emit(event, payload);
        this.publishBuyOrder(request.buyOrderId);
        this.publishSellOrder(request.sellOrderId);
      })
      .catch((error: unknown) => this.warn('request', tradeRequestId, error));
  }

  /**
   * 판매 잔량이 바뀐 뒤 후보 변경 신호.
   * 잔량은 발행 시점에 다시 읽어(발행 순서가 뒤바뀌어도 최신 값) 페이로드에 싣고,
   * 현재·이전 잔량(`previousRemaining`)을 NEAR 범위로 볼 수 있는 MATCHING 구매에만 보낸다.
   */
  publishMatchingChanged(
    sellOrderId: string,
    previousRemaining: ReadonlyArray<string | bigint>,
  ): void {
    void this.publishSellRemainingChange(sellOrderId, () =>
      previousRemaining.map((value) => BigInt(value)),
    ).catch((error: unknown) => this.warn('matching', sellOrderId, error));
  }

  /** Request 생성·해제 후: 해당 판매의 현재 잔량 ± 요청 금액 기준. */
  publishMatchingChangedForRequest(tradeRequestId: string): void {
    void this.tradeRequestRepository
      .findOne({
        where: { id: tradeRequestId },
        select: { id: true, sellOrderId: true, requestedCoinAmount: true },
      })
      .then(async (request) => {
        if (!request) return;
        const amount = BigInt(request.requestedCoinAmount);
        await this.publishSellRemainingChange(
          request.sellOrderId,
          (remaining) => [remaining + amount, remaining - amount],
        );
      })
      .catch((error: unknown) =>
        this.warn('matching-request', tradeRequestId, error),
      );
  }

  private async publishSellRemainingChange(
    sellOrderId: string,
    previousOf: (remaining: bigint) => bigint[],
  ): Promise<void> {
    const sellOrder = await this.sellOrderRepository.findOne({
      where: { id: sellOrderId },
      select: {
        id: true,
        status: true,
        remainingCoinAmount: true,
        cancelledAt: true,
      },
    });
    if (!sellOrder) return;
    const selectable =
      !sellOrder.cancelledAt &&
      (sellOrder.status === SellOrderStatus.OPEN ||
        sellOrder.status === SellOrderStatus.PARTIALLY_MATCHED);
    const stored = BigInt(sellOrder.remainingCoinAmount);
    const remaining = selectable ? stored : 0n;
    const targets = [remaining, ...previousOf(stored)].filter(
      (value) => value > 0n,
    );
    if (targets.length === 0) return;
    const buyOrderIds = await this.findMatchingBuyOrderIds(targets);
    this.signalMatching(buyOrderIds, {
      sellOrderId,
      remaining: remaining.toString(),
    });
  }

  private async findMatchingBuyOrderIds(amounts: bigint[]): Promise<string[]> {
    const policy = await this.matchingPolicyRepository.findOne({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC' },
      select: { id: true, nearMatchMaxRatioBps: true },
    });
    if (!policy) return [];

    const params: string[] = [BuyOrderStatus.MATCHING];
    const ranges = amounts.map((amount) => {
      const { min, max } = buyRangeForSell(amount, policy.nearMatchMaxRatioBps);
      params.push(min.toString());
      const minIdx = params.length;
      if (max === null) {
        return `o.coin_amount >= $${minIdx}::bigint`;
      }
      params.push(max.toString());
      return `o.coin_amount BETWEEN $${minIdx}::bigint AND $${params.length}::bigint`;
    });
    const rows: Array<{ id: string }> = await this.buyOrderRepository.query(
      `
      SELECT o.id
      FROM buy_orders o
      WHERE o.status = $1
        AND (${ranges.join(' OR ')})
      `,
      params,
    );
    return rows.map((row) => row.id);
  }

  /**
   * 같은 방은 MATCHING_SIGNAL_WINDOW_MS 안에 한 번(처음 + 마지막)만 보낸다.
   * 합쳐진 신호는 판매별 마지막 잔량만 담는다.
   */
  private signalMatching(
    buyOrderIds: string[],
    change: MatchingSellChange,
  ): void {
    if (!this.server || buyOrderIds.length === 0) return;
    const now = Date.now();
    for (const id of buyOrderIds) {
      const last = this.matchingLastSignalAt.get(id);
      if (last === undefined || now - last >= MATCHING_SIGNAL_WINDOW_MS) {
        this.emitMatching(id, [change], now);
      } else {
        let pending = this.matchingPending.get(id);
        if (!pending) {
          pending = new Map();
          this.matchingPending.set(id, pending);
        }
        pending.set(change.sellOrderId, change);
      }
    }
    if (this.matchingPending.size > 0 && !this.matchingFlushTimer) {
      this.matchingFlushTimer = setTimeout(
        () => this.flushMatching(),
        MATCHING_SIGNAL_WINDOW_MS,
      );
      this.matchingFlushTimer.unref?.();
    }
    this.pruneMatchingSignals(now);
  }

  private flushMatching(): void {
    this.matchingFlushTimer = null;
    const now = Date.now();
    const pending = [...this.matchingPending];
    this.matchingPending.clear();
    for (const [id, changes] of pending) {
      this.emitMatching(id, [...changes.values()], now);
    }
  }

  private emitMatching(
    buyOrderId: string,
    changes: MatchingSellChange[],
    now: number,
  ): void {
    this.matchingLastSignalAt.set(buyOrderId, now);
    this.server
      ?.to(buyOrderRoom(buyOrderId))
      .emit(ORDER_WS_EVENTS.MATCHING_CHANGED, { buyOrderId, changes });
  }

  private pruneMatchingSignals(now: number): void {
    if (this.matchingLastSignalAt.size < MATCHING_SIGNAL_PRUNE_SIZE) return;
    for (const [id, at] of this.matchingLastSignalAt) {
      if (
        now - at >= MATCHING_SIGNAL_WINDOW_MS &&
        !this.matchingPending.has(id)
      ) {
        this.matchingLastSignalAt.delete(id);
      }
    }
  }

  private warn(kind: string, id: string, error: unknown): void {
    this.logger.warn(
      `publish ${kind} failed id=${id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
