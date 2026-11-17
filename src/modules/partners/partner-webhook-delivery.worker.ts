import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { hostname } from 'os';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

import { decryptAccountNumber } from '../../common/utils/account-crypto.util';
import {
  PARTNER_WEBHOOK_BACKFILL_BATCH_SIZE,
  PARTNER_WEBHOOK_DELIVERY_BATCH_SIZE,
  PARTNER_WEBHOOK_DELIVERY_INTERVAL_MS,
  PARTNER_WEBHOOK_DELIVERY_LEASE_MS,
} from './domain/constants/partner-webhook-delivery.constants';
import { PartnerClientSecretStatus } from './domain/enums/partner-client-secret-status.enum';
import { PartnerClientSecretType } from './domain/enums/partner-client-secret-type.enum';
import { PartnerExchangeEventType } from './domain/enums/partner-exchange-event-type.enum';
import { PartnerWebhookDeliveryStatus } from './domain/enums/partner-webhook-delivery-status.enum';
import { PartnerClientSecretEntity } from './infrastructure/entities/partner-client-secret.entity';
import { PartnerExchangeEventEntity } from './infrastructure/entities/partner-exchange-event.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerWebhookDeliveryEntity } from './infrastructure/entities/partner-webhook-delivery.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerWebhookDeliveriesService } from './partner-webhook-deliveries.service';
import { signWebhookPayload } from './utils/partner-webhook-hmac.util';

type ClaimedDelivery = {
  delivery: PartnerWebhookDeliveryEntity;
  lockedBy: string;
  fenceToken: string;
};

const TIMESTAMP_HEADER = 'X-Brit-Timestamp';
const SIGNATURE_HEADER = 'X-Brit-Signature';
const KEY_ID_HEADER = 'X-Brit-Key-Id';
const EVENT_ID_HEADER = 'X-Brit-Event-Id';
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * B4-5: Webhook Delivery Worker + Event Scanner.
 * 원장·Exchange 상태를 변경하지 않는다.
 */
@Injectable()
export class PartnerWebhookDeliveryWorker {
  private readonly logger = new Logger(PartnerWebhookDeliveryWorker.name);
  private isRunning = false;
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly dataSource: DataSource,
    private readonly deliveriesService: PartnerWebhookDeliveriesService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(PARTNER_WEBHOOK_DELIVERY_INTERVAL_MS)
  async processBatch(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      await this.backfillMissingDeliveries();
      const claimed = await this.claimPendingBatch();
      for (const item of claimed) {
        try {
          await this.deliver(item);
        } catch (error) {
          this.logger.warn(
            `webhook deliver failed id=${item.delivery.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          await this.deliveriesService.rescheduleOrFail(
            item.delivery.id,
            item.lockedBy,
            item.fenceToken,
            item.delivery.attemptCount,
            {
              httpStatus: null,
              lastError:
                error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `webhook batch failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 이벤트는 있는데 Delivery가 없는 행을 채운다 (settle 직후 장애·구 데이터).
   */
  private async backfillMissingDeliveries(): Promise<void> {
    const rows: Array<{
      event_id: string;
      partner_client_id: string;
      webhook_url: string;
    }> = await this.dataSource.query(
      `
      SELECT e.id AS event_id,
             c.id AS partner_client_id,
             c.webhook_url AS webhook_url
      FROM partner_exchange_events e
      INNER JOIN partner_exchanges x ON x.id = e.partner_exchange_id
      INNER JOIN partner_clients c ON c.id = x.partner_client_id
      WHERE c.webhook_url IS NOT NULL
        AND e.event_type IN ($1, $2)
        AND NOT EXISTS (
          SELECT 1
          FROM partner_webhook_deliveries d
          WHERE d.partner_exchange_event_id = e.id
            AND d.partner_client_id = c.id
        )
      ORDER BY e.created_at ASC
      LIMIT $3
      `,
      [
        PartnerExchangeEventType.MERCHANT_PAYMENT_COMPLETED,
        PartnerExchangeEventType.MERCHANT_PAYMENT_FAILED,
        PARTNER_WEBHOOK_BACKFILL_BATCH_SIZE,
      ],
    );

    if (rows.length === 0) {
      return;
    }

    const repo = this.dataSource.getRepository(PartnerWebhookDeliveryEntity);
    for (const row of rows) {
      try {
        await repo.save(
          repo.create({
            partnerExchangeEventId: row.event_id,
            partnerClientId: row.partner_client_id,
            destinationUrl: row.webhook_url,
            status: PartnerWebhookDeliveryStatus.PENDING,
            attemptCount: 0,
            nextAttemptAt: new Date(),
            lockedBy: null,
            leaseExpiresAt: null,
            fenceToken: '0',
            httpStatus: null,
            lastError: null,
            deliveredAt: null,
          }),
        );
      } catch {
        // 유니크 경합 무시
      }
    }
  }

  private async claimPendingBatch(): Promise<ClaimedDelivery[]> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `
        SELECT id
        FROM partner_webhook_deliveries
        WHERE (
            status = $1
            AND next_attempt_at <= NOW()
          )
          OR (
            status = $2
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < NOW()
          )
        ORDER BY next_attempt_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $3
        `,
        [
          PartnerWebhookDeliveryStatus.PENDING,
          PartnerWebhookDeliveryStatus.CLAIMED,
          PARTNER_WEBHOOK_DELIVERY_BATCH_SIZE,
        ],
      );
      if (rows.length === 0) {
        return [];
      }

      const repo = manager.getRepository(PartnerWebhookDeliveryEntity);
      const claimed: ClaimedDelivery[] = [];
      const now = Date.now();
      for (const row of rows) {
        const delivery = await repo.findOne({ where: { id: row.id } });
        if (!delivery) {
          continue;
        }
        const fence = String(BigInt(delivery.fenceToken || '0') + 1n);
        delivery.status = PartnerWebhookDeliveryStatus.CLAIMED;
        delivery.attemptCount += 1;
        delivery.lockedBy = this.workerId;
        delivery.leaseExpiresAt = new Date(
          now + PARTNER_WEBHOOK_DELIVERY_LEASE_MS,
        );
        delivery.fenceToken = fence;
        delivery.nextAttemptAt = new Date(
          now + PARTNER_WEBHOOK_DELIVERY_LEASE_MS,
        );
        const saved = await repo.save(delivery);
        claimed.push({
          delivery: saved,
          lockedBy: this.workerId,
          fenceToken: fence,
        });
      }
      return claimed;
    });
  }

  private async deliver(item: ClaimedDelivery): Promise<void> {
    const event = await this.dataSource
      .getRepository(PartnerExchangeEventEntity)
      .findOne({ where: { id: item.delivery.partnerExchangeEventId } });
    if (!event) {
      await this.deliveriesService.markSkipped(
        item.delivery.id,
        item.lockedBy,
        item.fenceToken,
        'EVENT_NOT_FOUND',
      );
      return;
    }

    const exchange = await this.dataSource
      .getRepository(PartnerExchangeEntity)
      .findOne({ where: { id: event.partnerExchangeId } });
    if (!exchange) {
      await this.deliveriesService.markSkipped(
        item.delivery.id,
        item.lockedBy,
        item.fenceToken,
        'EXCHANGE_NOT_FOUND',
      );
      return;
    }

    const secret = await this.dataSource
      .getRepository(PartnerClientSecretEntity)
      .findOne({
        where: {
          partnerClientId: item.delivery.partnerClientId,
          secretType: PartnerClientSecretType.WEBHOOK_SECRET,
          status: PartnerClientSecretStatus.ACTIVE,
        },
        order: { createdAt: 'DESC' },
      });
    if (!secret?.secretEncrypted) {
      await this.deliveriesService.rescheduleOrFail(
        item.delivery.id,
        item.lockedBy,
        item.fenceToken,
        item.delivery.attemptCount,
        {
          httpStatus: null,
          lastError: 'WEBHOOK_SECRET_MISSING',
        },
      );
      return;
    }

    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    const signingSecret = decryptAccountNumber(
      secret.secretEncrypted,
      encryptionKey,
    );

    const intent = await this.dataSource
      .getRepository(PartnerPaymentIntentEntity)
      .findOne({ where: { partnerExchangeId: exchange.id } });
    const link = await this.dataSource
      .getRepository(UserPartnerLinkEntity)
      .findOne({ where: { id: exchange.userPartnerLinkId } });

    // payload 보조 필드 먼저, SoT 필드가 항상 최종값을 덮는다.
    const bodyObj = {
      ...(event.payload ?? {}),
      eventId: event.id,
      event: event.eventType,
      intentId: intent?.id ?? null,
      exchangeId: exchange.id,
      exchangeNumber: exchange.exchangeNumber,
      externalOrderId: intent?.externalOrderId ?? null,
      amount: exchange.amount,
      partnerUserKey: link?.partnerUserKey ?? null,
      partnerTransactionId: exchange.partnerTransactionId,
      completedAt:
        exchange.completedAt?.toISOString() ??
        exchange.failedAt?.toISOString() ??
        event.createdAt.toISOString(),
      failureCode: exchange.failureCode,
    };
    const rawBody = JSON.stringify(bodyObj);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhookPayload(signingSecret, timestamp, rawBody);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let httpStatus: number | null = null;
    try {
      const response = await fetch(item.delivery.destinationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
          [KEY_ID_HEADER]: secret.id,
          [EVENT_ID_HEADER]: event.id,
        },
        body: rawBody,
        signal: controller.signal,
      });
      httpStatus = response.status;
      if (response.ok) {
        await this.deliveriesService.markDelivered(
          item.delivery.id,
          item.lockedBy,
          item.fenceToken,
          httpStatus,
        );
        return;
      }
      const snippet = (await response.text()).slice(0, 200);
      await this.deliveriesService.rescheduleOrFail(
        item.delivery.id,
        item.lockedBy,
        item.fenceToken,
        item.delivery.attemptCount,
        {
          httpStatus,
          lastError: `HTTP_${httpStatus}:${snippet}`,
        },
      );
    } catch (error) {
      await this.deliveriesService.rescheduleOrFail(
        item.delivery.id,
        item.lockedBy,
        item.fenceToken,
        item.delivery.attemptCount,
        {
          httpStatus,
          lastError:
            error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
