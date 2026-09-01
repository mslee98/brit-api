import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import webpush from 'web-push';

import {
  NOTIFICATION_OUTBOX_BATCH_SIZE,
  NOTIFICATION_OUTBOX_INTERVAL_MS,
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  resolvePushTtlSeconds,
  type TradePushPayload,
} from './domain/constants/notification.constants';
import { NotificationOutboxStatus } from './domain/enums/notification-outbox-status.enum';
import { NotificationOutboxEntity } from './infrastructure/entities/notification-outbox.entity';
import { PushSubscriptionService } from './push-subscription.service';

/**
 * notification_outbox Web Push 발송.
 * HTTP는 이 Worker만 수행한다. Redis/Bull 없음.
 */
@Injectable()
export class NotificationOutboxWorker {
  private readonly logger = new Logger(NotificationOutboxWorker.name);
  private isRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly pushSubscriptionService: PushSubscriptionService,
  ) {}

  @Interval(NOTIFICATION_OUTBOX_INTERVAL_MS)
  async processOutboxBatch(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const vapid = this.pushSubscriptionService.getVapidDetails();
      if (!vapid) {
        this.logger.warn('outbox skipped: VAPID is not configured');
        return;
      }
      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

      const claimed = await this.claimPendingBatch();
      for (const item of claimed) {
        try {
          await this.deliver(item);
        } catch (error) {
          this.logger.warn(
            `outbox deliver failed id=${item.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `outbox batch failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async claimPendingBatch(): Promise<NotificationOutboxEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `
        SELECT id
        FROM notification_outbox
        WHERE status = $1
          AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
        `,
        [NotificationOutboxStatus.PENDING, NOTIFICATION_OUTBOX_BATCH_SIZE],
      );
      if (rows.length === 0) {
        return [];
      }

      const repo = manager.getRepository(NotificationOutboxEntity);
      const claimed: NotificationOutboxEntity[] = [];
      for (const row of rows) {
        const item = await repo.findOne({ where: { id: row.id } });
        if (!item) {
          continue;
        }
        item.attemptCount += 1;
        item.nextAttemptAt = new Date(Date.now() + 60_000);
        claimed.push(await repo.save(item));
      }
      return claimed;
    });
  }

  private async deliver(item: NotificationOutboxEntity): Promise<void> {
    const payload = item.payload as TradePushPayload;
    const body = JSON.stringify(payload);
    const ttl = resolvePushTtlSeconds(payload);
    const subscriptions = await this.pushSubscriptionService.findByUserId(
      item.recipientUserId,
    );

    if (subscriptions.length === 0) {
      await this.markStatus(
        item.id,
        NotificationOutboxStatus.SKIPPED,
        'NO_SUBSCRIPTION',
      );
      return;
    }

    let delivered = false;
    let retryableError: string | null = null;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          body,
          { TTL: ttl },
        );
        delivered = true;
      } catch (error) {
        const statusCode = this.readStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await this.pushSubscriptionService.deleteById(subscription.id);
          continue;
        }
        retryableError =
          error instanceof Error ? error.message.slice(0, 500) : String(error);
      }
    }

    if (delivered || !retryableError) {
      await this.markStatus(item.id, NotificationOutboxStatus.SENT, null);
      return;
    }

    await this.retryOrFail(item, retryableError);
  }

  private async retryOrFail(
    item: NotificationOutboxEntity,
    lastError: string,
  ): Promise<void> {
    if (item.attemptCount >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS) {
      await this.markStatus(
        item.id,
        NotificationOutboxStatus.FAILED,
        lastError,
      );
      return;
    }

    await this.dataSource.getRepository(NotificationOutboxEntity).update(
      { id: item.id },
      {
        status: NotificationOutboxStatus.PENDING,
        lastError,
        nextAttemptAt: new Date(Date.now() + this.nextDelayMs(item.attemptCount)),
      },
    );
  }

  private async markStatus(
    id: string,
    status: NotificationOutboxStatus,
    lastError: string | null,
  ): Promise<void> {
    await this.dataSource.getRepository(NotificationOutboxEntity).update(
      { id },
      { status, lastError },
    );
  }

  private nextDelayMs(attemptCount: number): number {
    const delays = [
      2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000,
    ];
    return delays[Math.min(attemptCount - 1, delays.length - 1)] ?? 600_000;
  }

  private readStatusCode(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      return typeof statusCode === 'number' ? statusCode : undefined;
    }
    return undefined;
  }
}
