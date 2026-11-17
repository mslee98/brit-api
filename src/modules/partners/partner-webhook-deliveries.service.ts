import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  PARTNER_WEBHOOK_DELIVERY_BACKOFF_MS,
  PARTNER_WEBHOOK_DELIVERY_MAX_ATTEMPTS,
} from './domain/constants/partner-webhook-delivery.constants';
import { PartnerWebhookDeliveryStatus } from './domain/enums/partner-webhook-delivery-status.enum';
import { PartnerClientEntity } from './infrastructure/entities/partner-client.entity';
import { PartnerExchangeEventEntity } from './infrastructure/entities/partner-exchange-event.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerWebhookDeliveryEntity } from './infrastructure/entities/partner-webhook-delivery.entity';

/**
 * B4-5: Webhook Delivery enqueue / 재예약.
 * HTTP 전송은 PartnerWebhookDeliveryWorker만 수행한다.
 */
@Injectable()
export class PartnerWebhookDeliveriesService {
  private readonly logger = new Logger(PartnerWebhookDeliveriesService.name);

  constructor(
    @InjectRepository(PartnerWebhookDeliveryEntity)
    private readonly deliveryRepository: Repository<PartnerWebhookDeliveryEntity>,
  ) {}

  /**
   * settle TX 안에서 호출. webhookUrl 없으면 no-op.
   */
  async enqueueForEventInTransaction(
    manager: EntityManager,
    event: PartnerExchangeEventEntity,
    exchange: PartnerExchangeEntity,
  ): Promise<PartnerWebhookDeliveryEntity | null> {
    if (!exchange.partnerClientId) {
      return null;
    }

    const client = await manager.getRepository(PartnerClientEntity).findOne({
      where: { id: exchange.partnerClientId },
    });
    if (!client?.webhookUrl) {
      return null;
    }

    const deliveryRepo = manager.getRepository(PartnerWebhookDeliveryEntity);
    const existing = await deliveryRepo.findOne({
      where: {
        partnerExchangeEventId: event.id,
        partnerClientId: client.id,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      return existing;
    }

    try {
      return await deliveryRepo.save(
        deliveryRepo.create({
          partnerExchangeEventId: event.id,
          partnerClientId: client.id,
          destinationUrl: client.webhookUrl,
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
    } catch (error) {
      // 유니크 경합 — Scanner/동시 settle
      this.logger.debug(
        `webhook delivery enqueue race event=${event.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return deliveryRepo.findOne({
        where: {
          partnerExchangeEventId: event.id,
          partnerClientId: client.id,
        },
      });
    }
  }

  nextBackoffMs(attemptCount: number): number {
    const idx = Math.min(
      Math.max(attemptCount - 1, 0),
      PARTNER_WEBHOOK_DELIVERY_BACKOFF_MS.length - 1,
    );
    return PARTNER_WEBHOOK_DELIVERY_BACKOFF_MS[idx] ?? 3_600_000;
  }

  shouldFailPermanently(attemptCount: number): boolean {
    return attemptCount >= PARTNER_WEBHOOK_DELIVERY_MAX_ATTEMPTS;
  }

  async markDelivered(
    deliveryId: string,
    lockedBy: string,
    fenceToken: string,
    httpStatus: number | null,
  ): Promise<boolean> {
    const result = await this.deliveryRepository
      .createQueryBuilder()
      .update(PartnerWebhookDeliveryEntity)
      .set({
        status: PartnerWebhookDeliveryStatus.DELIVERED,
        deliveredAt: () => 'NOW()',
        lockedBy: null,
        leaseExpiresAt: null,
        httpStatus,
        lastError: null,
      })
      .where('id = :deliveryId', { deliveryId })
      .andWhere('locked_by = :lockedBy', { lockedBy })
      .andWhere('fence_token = :fenceToken', { fenceToken })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markSkipped(
    deliveryId: string,
    lockedBy: string,
    fenceToken: string,
    reason: string,
  ): Promise<boolean> {
    const result = await this.deliveryRepository
      .createQueryBuilder()
      .update(PartnerWebhookDeliveryEntity)
      .set({
        status: PartnerWebhookDeliveryStatus.SKIPPED,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: reason.slice(0, 500),
      })
      .where('id = :deliveryId', { deliveryId })
      .andWhere('locked_by = :lockedBy', { lockedBy })
      .andWhere('fence_token = :fenceToken', { fenceToken })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async rescheduleOrFail(
    deliveryId: string,
    lockedBy: string,
    fenceToken: string,
    attemptCount: number,
    input: { httpStatus: number | null; lastError: string },
  ): Promise<boolean> {
    if (this.shouldFailPermanently(attemptCount)) {
      const result = await this.deliveryRepository
        .createQueryBuilder()
        .update(PartnerWebhookDeliveryEntity)
        .set({
          status: PartnerWebhookDeliveryStatus.FAILED,
          lockedBy: null,
          leaseExpiresAt: null,
          httpStatus: input.httpStatus,
          lastError: input.lastError.slice(0, 500),
        })
        .where('id = :deliveryId', { deliveryId })
        .andWhere('locked_by = :lockedBy', { lockedBy })
        .andWhere('fence_token = :fenceToken', { fenceToken })
        .execute();
      return (result.affected ?? 0) > 0;
    }

    const result = await this.deliveryRepository
      .createQueryBuilder()
      .update(PartnerWebhookDeliveryEntity)
      .set({
        status: PartnerWebhookDeliveryStatus.PENDING,
        nextAttemptAt: new Date(Date.now() + this.nextBackoffMs(attemptCount)),
        lockedBy: null,
        leaseExpiresAt: null,
        httpStatus: input.httpStatus,
        lastError: input.lastError.slice(0, 500),
      })
      .where('id = :deliveryId', { deliveryId })
      .andWhere('locked_by = :lockedBy', { lockedBy })
      .andWhere('fence_token = :fenceToken', { fenceToken })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
