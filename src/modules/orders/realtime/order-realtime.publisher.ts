import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Server } from 'socket.io';
import { Repository } from 'typeorm';

import { TradeRequestEntity } from '../../matching/infrastructure/entities/trade-request.entity';
import { BuyOrderStatus } from '../domain/enums/buy-order-status.enum';
import { BuyOrderEntity } from '../infrastructure/entities/buy-order.entity';
import { SellOrderEntity } from '../infrastructure/entities/sell-order.entity';
import {
  buyOrderRoom,
  ORDER_WS_EVENTS,
  orderUserRoom,
} from './order-realtime.constants';

/**
 * 주문·신청 커밋 후 user room 신호. 화면 본문은 REST.
 * 후보 변경은 현재 MATCHING 구매의 buy-order room에만 보낸다.
 */
@Injectable()
export class OrderRealtimePublisher {
  private readonly logger = new Logger(OrderRealtimePublisher.name);
  private server: Server | null = null;

  constructor(
    @InjectRepository(BuyOrderEntity)
    private readonly buyOrderRepository: Repository<BuyOrderEntity>,
    @InjectRepository(SellOrderEntity)
    private readonly sellOrderRepository: Repository<SellOrderEntity>,
    @InjectRepository(TradeRequestEntity)
    private readonly tradeRequestRepository: Repository<TradeRequestEntity>,
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
        this.server.to(orderUserRoom(order.buyerUserId)).emit(ORDER_WS_EVENTS.BUY_UPDATED, {
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
        this.server.to(orderUserRoom(order.sellerUserId)).emit(ORDER_WS_EVENTS.SELL_UPDATED, {
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
        this.server.to(orderUserRoom(request.sellerUserId)).emit(event, payload);
        this.publishBuyOrder(request.buyOrderId);
        this.publishSellOrder(request.sellOrderId);
      })
      .catch((error: unknown) => this.warn('request', tradeRequestId, error));
  }

  /** 판매 잔량이 바뀐 뒤, 매칭 대기 중인 구매 방에만 후보 재조회 신호. */
  publishMatchingChanged(): void {
    void this.buyOrderRepository
      .find({
        where: { status: BuyOrderStatus.MATCHING },
        select: { id: true },
      })
      .then((orders) => {
        if (!this.server) return;
        for (const order of orders) {
          this.server.to(buyOrderRoom(order.id)).emit(ORDER_WS_EVENTS.MATCHING_CHANGED, {
            buyOrderId: order.id,
          });
        }
      })
      .catch((error: unknown) => this.warn('matching', '*', error));
  }

  private warn(kind: string, id: string, error: unknown): void {
    this.logger.warn(
      `publish ${kind} failed id=${id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
