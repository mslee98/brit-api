import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  MATCHING_EXPIRY_BATCH_SIZE,
  MATCHING_EXPIRY_INTERVAL_MS,
  TRADE_REQUEST_EXPIRY_BATCH_SIZE,
} from './domain/constants/matching.constants';
import { MatchingService } from './matching.service';

/**
 * Buy MATCHING TTL + TradeRequest PENDING TTL 만료 Worker.
 * Trade를 만들지 않는다.
 */
@Injectable()
export class MatchingWorker {
  private readonly logger = new Logger(MatchingWorker.name);
  private isRunning = false;

  constructor(private readonly matchingService: MatchingService) {}

  @Interval(MATCHING_EXPIRY_INTERVAL_MS)
  async processExpiryBatch(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      await this.expireMatchingBuyOrders();
      await this.expirePendingTradeRequests();
    } catch (error) {
      this.logger.warn(
        `expiry batch failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async expireMatchingBuyOrders(): Promise<void> {
    const orderIds =
      await this.matchingService.findExpiredMatchingBuyOrderIds(
        MATCHING_EXPIRY_BATCH_SIZE,
      );
    for (const orderId of orderIds) {
      try {
        await this.matchingService.expireBuyOrder(orderId);
      } catch (error) {
        this.logger.warn(
          `expire failed for buyOrder=${orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async expirePendingTradeRequests(): Promise<void> {
    const requestIds =
      await this.matchingService.findExpiredPendingTradeRequestIds(
        TRADE_REQUEST_EXPIRY_BATCH_SIZE,
      );
    for (const requestId of requestIds) {
      try {
        await this.matchingService.expireTradeRequest(requestId);
      } catch (error) {
        this.logger.warn(
          `expire failed for tradeRequest=${requestId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
