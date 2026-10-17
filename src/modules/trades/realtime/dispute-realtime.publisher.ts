import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import type { AdminDisputeMessageDto } from '../dto/dispute-message.dto';
import { TradeDisputeStatus } from '../domain/enums/trade-dispute-status.enum';
import {
  ADMIN_DISPUTES_ROOM,
  DISPUTE_WS_EVENTS,
  disputeRoom,
  partyUserRoom,
} from './dispute-realtime.constants';

export type DisputeQueueEventPayload = {
  disputeId: string;
  tradeId: string;
  status: TradeDisputeStatus;
  buyerUserId?: string;
  sellerUserId?: string;
};

export type DisputeMessageCreatedPayload = {
  disputeId: string;
  message: AdminDisputeMessageDto;
};

/**
 * REST 저장 후 Socket.IO로 푸시. Gateway afterInit에서 Server를 attach.
 * 내부 메모는 dispute room 중 isAdmin 소켓에만 전달.
 */
@Injectable()
export class DisputeRealtimePublisher {
  private readonly logger = new Logger(DisputeRealtimePublisher.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  async publishMessageCreated(
    payload: DisputeMessageCreatedPayload,
  ): Promise<void> {
    if (!this.server) return;
    const room = disputeRoom(payload.disputeId);
    try {
      const sockets = await this.server.in(room).fetchSockets();
      for (const socket of sockets) {
        if (payload.message.isInternal && !socket.data.isAdmin) {
          continue;
        }
        socket.emit(DISPUTE_WS_EVENTS.MESSAGE_CREATED, payload);
      }
      if (!payload.message.isInternal) {
        this.server.to(ADMIN_DISPUTES_ROOM).emit(
          DISPUTE_WS_EVENTS.MESSAGE_CREATED,
          payload,
        );
      }
    } catch (error) {
      this.logger.warn(
        `publishMessageCreated failed dispute=${payload.disputeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  publishDisputeOpened(payload: DisputeQueueEventPayload): void {
    if (!this.server) return;
    this.server.to(ADMIN_DISPUTES_ROOM).emit(DISPUTE_WS_EVENTS.OPENED, payload);
    if (payload.buyerUserId) {
      this.server
        .to(partyUserRoom(payload.buyerUserId))
        .emit(DISPUTE_WS_EVENTS.OPENED, payload);
    }
    if (payload.sellerUserId) {
      this.server
        .to(partyUserRoom(payload.sellerUserId))
        .emit(DISPUTE_WS_EVENTS.OPENED, payload);
    }
  }

  publishDisputeUpdated(payload: DisputeQueueEventPayload): void {
    this.server
      ?.to(ADMIN_DISPUTES_ROOM)
      .emit(DISPUTE_WS_EVENTS.UPDATED, payload);
  }

  publishDisputeResolved(payload: DisputeQueueEventPayload): void {
    this.server
      ?.to(ADMIN_DISPUTES_ROOM)
      .emit(DISPUTE_WS_EVENTS.RESOLVED, payload);
    this.server
      ?.to(disputeRoom(payload.disputeId))
      .emit(DISPUTE_WS_EVENTS.RESOLVED, payload);
  }
}
