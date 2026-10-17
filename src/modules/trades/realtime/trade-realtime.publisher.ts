import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { TradeStatus } from '../domain/enums/trade-status.enum';
import { TRADE_WS_EVENTS, tradeUserRoom } from './trade-realtime.constants';

export type TradeUpdatedPayload = {
  tradeId: string;
  status: TradeStatus;
  buyerUserId: string;
  sellerUserId: string;
};

/**
 * 상태 전이 커밋 후 당사자 user room으로 알림. 상세 조회는 REST.
 */
@Injectable()
export class TradeRealtimePublisher {
  private readonly logger = new Logger(TradeRealtimePublisher.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  publishUpdated(payload: TradeUpdatedPayload): void {
    if (!this.server) return;
    try {
      const event = TRADE_WS_EVENTS.UPDATED;
      this.server.to(tradeUserRoom(payload.buyerUserId)).emit(event, payload);
      this.server.to(tradeUserRoom(payload.sellerUserId)).emit(event, payload);
    } catch (error) {
      this.logger.warn(
        `publishUpdated failed trade=${payload.tradeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
