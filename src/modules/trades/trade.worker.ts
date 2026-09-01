import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  TRADE_TIMEOUT_BATCH_SIZE,
  TRADE_TIMEOUT_INTERVAL_MS,
} from './domain/constants/trade.constants';
import { TradeService } from './trade.service';

/**
 * 입금/판매자 확인 timeout 및 COIN_TRANSFERRING 복구.
 * Redis/Bull 없이 PostgreSQL SKIP LOCKED.
 */
@Injectable()
export class TradeWorker {
  private readonly logger = new Logger(TradeWorker.name);
  private isRunning = false;

  constructor(private readonly tradeService: TradeService) {}

  @Interval(TRADE_TIMEOUT_INTERVAL_MS)
  async processTimeoutBatch(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      await this.tradeService.expireDueBuyerPayments(TRADE_TIMEOUT_BATCH_SIZE);
      await this.tradeService.expireDueSellerConfirmations(
        TRADE_TIMEOUT_BATCH_SIZE,
      );
      await this.tradeService.recoverStuckTransfers(TRADE_TIMEOUT_BATCH_SIZE);
    } catch (error) {
      this.logger.warn(
        `trade timeout batch failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
