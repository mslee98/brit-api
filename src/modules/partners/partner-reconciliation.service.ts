import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { PartnerExchangeOpsNoteAction } from './domain/enums/partner-exchange-ops-note-action.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerWebhookDeliveryStatus } from './domain/enums/partner-webhook-delivery-status.enum';
import {
  CreatePartnerExchangeOpsNoteDto,
  ReconciliationDetailDto,
  ReconciliationMetricsDto,
  ReconciliationOpsNoteDto,
  ReconciliationQueueItemDto,
  type ReconPriority,
  SearchReconciliationsDto,
} from './dto/partner-reconciliation.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerExchangeAttemptEntity } from './infrastructure/entities/partner-exchange-attempt.entity';
import { PartnerExchangeCoinLotEntity } from './infrastructure/entities/partner-exchange-coin-lot.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerExchangeEventEntity } from './infrastructure/entities/partner-exchange-event.entity';
import { PartnerExchangeJobEntity } from './infrastructure/entities/partner-exchange-job.entity';
import { PartnerExchangeOpsNoteEntity } from './infrastructure/entities/partner-exchange-ops-note.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { PartnerWebhookDeliveryEntity } from './infrastructure/entities/partner-webhook-delivery.entity';
import { PartnerChargeSettlementService } from './partner-charge-settlement.service';
import { PartnerOperationsService } from './partner-operations.service';
import { isTerminalExternalResult } from './utils/partner-external-result.util';

const OPEN_STATUSES: PartnerExchangeStatus[] = [
  PartnerExchangeStatus.ASSET_LOCKED,
  PartnerExchangeStatus.PARTNER_PROCESSING,
  PartnerExchangeStatus.RECONCILIATION_REQUIRED,
];

/**
 * B4-6: 운영 대사 큐·상세·조치. 자산 확정은 settleIfTerminal만 사용.
 */
@Injectable()
export class PartnerReconciliationService {
  constructor(
    @InjectRepository(PartnerExchangeEntity)
    private readonly exchangeRepository: Repository<PartnerExchangeEntity>,
    @InjectRepository(PartnerExchangeAttemptEntity)
    private readonly attemptRepository: Repository<PartnerExchangeAttemptEntity>,
    @InjectRepository(PartnerExchangeCoinLotEntity)
    private readonly lotRepository: Repository<PartnerExchangeCoinLotEntity>,
    @InjectRepository(PartnerExchangeEventEntity)
    private readonly eventRepository: Repository<PartnerExchangeEventEntity>,
    @InjectRepository(PartnerExchangeJobEntity)
    private readonly jobRepository: Repository<PartnerExchangeJobEntity>,
    @InjectRepository(PartnerExchangeOpsNoteEntity)
    private readonly noteRepository: Repository<PartnerExchangeOpsNoteEntity>,
    @InjectRepository(PartnerWebhookDeliveryEntity)
    private readonly deliveryRepository: Repository<PartnerWebhookDeliveryEntity>,
    @InjectRepository(PartnerPaymentIntentEntity)
    private readonly intentRepository: Repository<PartnerPaymentIntentEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    private readonly operationsService: PartnerOperationsService,
    private readonly chargeSettlementService: PartnerChargeSettlementService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listQueue(
    query: SearchReconciliationsDto,
  ): Promise<{ items: ReconciliationQueueItemDto[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const olderThanMinutes = query.olderThanMinutes ?? 30;
    const includeStale = query.includeStale !== false;
    const staleBefore = new Date(Date.now() - olderThanMinutes * 60_000);

    const qb = this.exchangeRepository
      .createQueryBuilder('e')
      .innerJoin(PartnerEntity, 'p', 'p.id = e.partner_id')
      .leftJoin(
        PartnerExchangeJobEntity,
        'j',
        'j.partner_exchange_id = e.id',
      )
      .leftJoin(
        PartnerPaymentIntentEntity,
        'i',
        'i.partner_exchange_id = e.id',
      )
      .select('e.id', 'exchangeId')
      .addSelect('e.exchange_number', 'exchangeNumber')
      .addSelect('e.partner_id', 'partnerId')
      .addSelect('p.name', 'partnerName')
      .addSelect('e.amount', 'amount')
      .addSelect('e.status', 'status')
      .addSelect('e.external_result_status', 'externalResultStatus')
      .addSelect('e.requested_at', 'requestedAt')
      .addSelect('e.asset_locked_at', 'assetLockedAt')
      .addSelect('j.status', 'jobStatus')
      .addSelect('i.id', 'intentId')
      .where('e.status IN (:...openStatuses)', { openStatuses: OPEN_STATUSES });

    if (query.partnerId) {
      qb.andWhere('e.partner_id = :partnerId', { partnerId: query.partnerId });
    }

    if (includeStale) {
      qb.andWhere(
        `(
          e.status = :recon
          OR e.external_result_status = :succeeded
          OR COALESCE(e.asset_locked_at, e.requested_at) <= :staleBefore
        )`,
        {
          recon: PartnerExchangeStatus.RECONCILIATION_REQUIRED,
          succeeded: PartnerExternalResultStatus.SUCCEEDED,
          staleBefore,
        },
      );
    } else {
      qb.andWhere(
        `(e.status = :recon OR e.external_result_status = :succeeded)`,
        {
          recon: PartnerExchangeStatus.RECONCILIATION_REQUIRED,
          succeeded: PartnerExternalResultStatus.SUCCEEDED,
        },
      );
    }

    const totalItems = await qb.getCount();

    qb.orderBy(
      `CASE
        WHEN e.external_result_status = 'SUCCEEDED' THEN 0
        WHEN e.status = 'RECONCILIATION_REQUIRED' THEN 1
        ELSE 2
      END`,
      'ASC',
    )
      .addOrderBy('COALESCE(e.asset_locked_at, e.requested_at)', 'ASC')
      .offset((page - 1) * size)
      .limit(size);

    const rows = await qb.getRawMany<{
      exchangeId: string;
      exchangeNumber: string;
      partnerId: string;
      partnerName: string;
      amount: string;
      status: PartnerExchangeStatus;
      externalResultStatus: PartnerExternalResultStatus;
      requestedAt: Date;
      assetLockedAt: Date | null;
      jobStatus: string | null;
      intentId: string | null;
    }>();

    const exchangeIds = rows.map((r) => r.exchangeId);
    const lastAttempts = await this.loadLastAttemptResults(exchangeIds);

    const now = Date.now();
    const items: ReconciliationQueueItemDto[] = rows.map((row) => {
      const anchor = row.assetLockedAt ?? row.requestedAt;
      const ageMinutes = Math.max(
        0,
        Math.floor((now - new Date(anchor).getTime()) / 60_000),
      );
      return {
        exchangeId: row.exchangeId,
        exchangeNumber: row.exchangeNumber,
        partnerId: row.partnerId,
        partnerName: row.partnerName,
        amount: String(row.amount),
        status: row.status,
        externalResultStatus: row.externalResultStatus,
        jobStatus: (row.jobStatus as ReconciliationQueueItemDto['jobStatus']) ?? null,
        lastAttemptResult: lastAttempts.get(row.exchangeId) ?? null,
        intentId: row.intentId,
        ageMinutes,
        priority: this.priorityOf(row.status, row.externalResultStatus),
        requestedAt: new Date(row.requestedAt).toISOString(),
        assetLockedAt: row.assetLockedAt
          ? new Date(row.assetLockedAt).toISOString()
          : null,
      };
    });

    return { items, meta: buildPaginationMeta(page, size, totalItems) };
  }

  async getMetrics(): Promise<ReconciliationMetricsDto> {
    const reconCount = await this.exchangeRepository.count({
      where: { status: PartnerExchangeStatus.RECONCILIATION_REQUIRED },
    });

    const lockedRows = await this.exchangeRepository
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount::numeric), 0)', 'total')
      .where('e.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .getRawOne<{ total: string }>();

    const oldest = await this.exchangeRepository
      .createQueryBuilder('e')
      .select('MIN(COALESCE(e.asset_locked_at, e.requested_at))', 'oldest')
      .where('e.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .getRawOne<{ oldest: Date | null }>();

    const partnerSucceededBritOpenCount = await this.exchangeRepository.count({
      where: {
        externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
        status: In([
          PartnerExchangeStatus.ASSET_LOCKED,
          PartnerExchangeStatus.PARTNER_PROCESSING,
          PartnerExchangeStatus.RECONCILIATION_REQUIRED,
        ]),
      },
    });

    const webhookDeliveryFailedCount = await this.deliveryRepository.count({
      where: { status: PartnerWebhookDeliveryStatus.FAILED },
    });

    let oldestAgeMinutes: number | null = null;
    if (oldest?.oldest) {
      oldestAgeMinutes = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(oldest.oldest).getTime()) / 60_000,
        ),
      );
    }

    return {
      reconciliationRequiredCount: reconCount,
      lockedAmountTotal: String(lockedRows?.total ?? '0'),
      oldestAgeMinutes,
      partnerSucceededBritOpenCount,
      webhookDeliveryFailedCount,
    };
  }

  async getDetail(
    partnerId: string,
    exchangeId: string,
  ): Promise<ReconciliationDetailDto> {
    const exchange = await this.requireExchangeForPartner(
      partnerId,
      exchangeId,
    );
    const partner = await this.partnerRepository.findOneOrFail({
      where: { id: partnerId },
    });

    const [lots, attempts, job, events, notes, intent] = await Promise.all([
      this.lotRepository.find({
        where: { partnerExchangeId: exchangeId },
      }),
      this.attemptRepository.find({
        where: { partnerExchangeId: exchangeId },
        order: { attemptNo: 'ASC' },
      }),
      this.jobRepository.findOne({
        where: { partnerExchangeId: exchangeId },
      }),
      this.eventRepository.find({
        where: { partnerExchangeId: exchangeId },
        order: { createdAt: 'ASC' },
      }),
      this.noteRepository.find({
        where: { partnerExchangeId: exchangeId },
        order: { createdAt: 'DESC' },
      }),
      this.intentRepository.findOne({
        where: { partnerExchangeId: exchangeId },
      }),
    ]);

    const eventIds = events.map((e) => e.id);
    const exchangeDeliveries =
      eventIds.length === 0
        ? []
        : await this.deliveryRepository.find({
            where: { partnerExchangeEventId: In(eventIds) },
            order: { createdAt: 'ASC' },
          });

    const remainingLockedAmount = lots
      .reduce((sum, row) => sum + BigInt(row.remainingLockedAmount), 0n)
      .toString();

    return {
      exchangeId: exchange.id,
      exchangeNumber: exchange.exchangeNumber,
      partnerId: exchange.partnerId,
      partnerName: partner.name,
      amount: exchange.amount,
      status: exchange.status,
      externalResultStatus: exchange.externalResultStatus,
      partnerTransactionId: exchange.partnerTransactionId,
      failureCode: exchange.failureCode,
      failureMessage: exchange.failureMessage,
      intentId: intent?.id ?? null,
      externalOrderId: intent?.externalOrderId ?? null,
      intentStatus: intent?.status ?? null,
      remainingLockedAmount,
      canSettle: isTerminalExternalResult(exchange.externalResultStatus),
      attempts: attempts.map((a) => ({
        id: a.id,
        attemptNo: a.attemptNo,
        attemptType: a.attemptType,
        result: a.result,
        partnerStatus: a.partnerStatus,
        httpStatus: a.httpStatus,
        errorCode: a.errorCode,
        errorMessage: a.errorMessage,
        startedAt: a.startedAt.toISOString(),
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
      job: job
        ? {
            id: job.id,
            jobType: job.jobType,
            status: job.status,
            attemptCount: job.attemptCount,
            nextRunAt: job.nextRunAt.toISOString(),
            lockedBy: job.lockedBy,
            leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
            lastErrorCode: job.lastErrorCode,
          }
        : null,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
      deliveries: exchangeDeliveries.map((d) => ({
        id: d.id,
        status: d.status,
        destinationUrl: d.destinationUrl,
        attemptCount: d.attemptCount,
        lastError: d.lastError,
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
      })),
      notes: notes.map((n) => this.toNoteDto(n)),
    };
  }

  async sync(
    actorUserId: string,
    partnerId: string,
    exchangeId: string,
    ipAddress: string | null,
    reason: string | null,
  ) {
    const exchange = await this.requireExchangeForPartner(
      partnerId,
      exchangeId,
    );
    const result = await this.operationsService.syncPartnerResult(exchange.id);
    await this.writeNote(
      exchange.id,
      actorUserId,
      PartnerExchangeOpsNoteAction.SYNC,
      reason?.trim() || '운영 STATUS 재조회',
    );
    await this.auditLogService.write({
      actorUserId,
      actionType: AuditActionType.SYNC_PARTNER_EXCHANGE,
      targetType: AuditTargetType.PARTNER_EXCHANGE,
      targetId: exchange.id,
      beforeData: {
        status: exchange.status,
        externalResultStatus: exchange.externalResultStatus,
      },
      afterData: {
        status: result.status,
        externalResultStatus: result.externalResultStatus,
        settledStatus: result.settledStatus ?? null,
      },
      reason: reason ?? 'admin sync-partner-result',
      ipAddress,
    });
    return result;
  }

  async settle(
    actorUserId: string,
    partnerId: string,
    exchangeId: string,
    ipAddress: string | null,
    reason: string | null,
  ) {
    const exchange = await this.requireExchangeForPartner(
      partnerId,
      exchangeId,
    );
    const result = await this.chargeSettlementService.settleIfTerminal(
      exchange.id,
    );
    if (!result) {
      throw PartnerDomainException.settlementNotReady(
        exchange.externalResultStatus,
      );
    }
    await this.writeNote(
      exchange.id,
      actorUserId,
      PartnerExchangeOpsNoteAction.SETTLE,
      reason?.trim() || '운영 외부 확정 결과 반영',
    );
    await this.auditLogService.write({
      actorUserId,
      actionType: AuditActionType.SETTLE_PARTNER_EXCHANGE,
      targetType: AuditTargetType.PARTNER_EXCHANGE,
      targetId: exchange.id,
      beforeData: {
        status: exchange.status,
        externalResultStatus: exchange.externalResultStatus,
      },
      afterData: {
        status: result.status,
        externalResultStatus: result.externalResultStatus,
        alreadySettled: result.alreadySettled,
      },
      reason: reason ?? 'admin settle',
      ipAddress,
    });
    return result;
  }

  async addNote(
    actorUserId: string,
    partnerId: string,
    exchangeId: string,
    dto: CreatePartnerExchangeOpsNoteDto,
    ipAddress: string | null,
  ): Promise<ReconciliationOpsNoteDto> {
    const exchange = await this.requireExchangeForPartner(
      partnerId,
      exchangeId,
    );
    const noteText = dto.note.trim();
    if (!noteText) {
      throw PartnerDomainException.opsNoteRequired();
    }
    const saved = await this.writeNote(
      exchange.id,
      actorUserId,
      PartnerExchangeOpsNoteAction.NOTE,
      noteText,
    );
    await this.auditLogService.write({
      actorUserId,
      actionType: AuditActionType.NOTE_PARTNER_EXCHANGE_RECON,
      targetType: AuditTargetType.PARTNER_EXCHANGE,
      targetId: exchange.id,
      beforeData: null,
      afterData: { noteId: saved.id, action: saved.action },
      reason: dto.reason ?? noteText.slice(0, 200),
      ipAddress,
    });
    return this.toNoteDto(saved);
  }

  async retryWebhookDelivery(
    actorUserId: string,
    partnerId: string,
    deliveryId: string,
    ipAddress: string | null,
    reason: string | null,
  ): Promise<{ id: string; status: PartnerWebhookDeliveryStatus }> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw PartnerDomainException.webhookDeliveryNotFound();
    }

    const event = await this.eventRepository.findOne({
      where: { id: delivery.partnerExchangeEventId },
    });
    if (!event) {
      throw PartnerDomainException.webhookDeliveryNotFound();
    }
    const exchange = await this.requireExchangeForPartner(
      partnerId,
      event.partnerExchangeId,
    );

    delivery.status = PartnerWebhookDeliveryStatus.PENDING;
    delivery.nextAttemptAt = new Date();
    delivery.lockedBy = null;
    delivery.leaseExpiresAt = null;
    delivery.lastError = null;
    await this.deliveryRepository.save(delivery);

    await this.writeNote(
      exchange.id,
      actorUserId,
      PartnerExchangeOpsNoteAction.RETRY_WEBHOOK,
      reason?.trim() || `Webhook Delivery 재시도 ${delivery.id}`,
    );
    await this.auditLogService.write({
      actorUserId,
      actionType: AuditActionType.RETRY_PARTNER_WEBHOOK_DELIVERY,
      targetType: AuditTargetType.PARTNER_EXCHANGE,
      targetId: exchange.id,
      beforeData: { deliveryId: delivery.id },
      afterData: { deliveryId: delivery.id, status: delivery.status },
      reason: reason ?? 'admin webhook retry',
      ipAddress,
    });

    return { id: delivery.id, status: delivery.status };
  }

  priorityOf(
    status: PartnerExchangeStatus,
    external: PartnerExternalResultStatus,
  ): ReconPriority {
    if (
      external === PartnerExternalResultStatus.SUCCEEDED &&
      status !== PartnerExchangeStatus.COMPLETED
    ) {
      return 'HIGH';
    }
    if (status === PartnerExchangeStatus.RECONCILIATION_REQUIRED) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private async requireExchangeForPartner(
    partnerId: string,
    exchangeId: string,
  ): Promise<PartnerExchangeEntity> {
    const exchange = await this.exchangeRepository.findOne({
      where: { id: exchangeId },
    });
    if (!exchange) {
      throw PartnerDomainException.exchangeNotFound();
    }
    if (exchange.partnerId !== partnerId) {
      throw PartnerDomainException.exchangePartnerMismatch();
    }
    return exchange;
  }

  private async writeNote(
    partnerExchangeId: string,
    authorUserId: string,
    action: PartnerExchangeOpsNoteAction,
    note: string,
  ): Promise<PartnerExchangeOpsNoteEntity> {
    return this.noteRepository.save(
      this.noteRepository.create({
        partnerExchangeId,
        authorUserId,
        action,
        note: note.slice(0, 1000),
      }),
    );
  }

  private toNoteDto(
    note: PartnerExchangeOpsNoteEntity,
  ): ReconciliationOpsNoteDto {
    return {
      id: note.id,
      authorUserId: note.authorUserId,
      note: note.note,
      action: note.action,
      createdAt: note.createdAt.toISOString(),
    };
  }

  private async loadLastAttemptResults(
    exchangeIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (exchangeIds.length === 0) return map;
    const attempts = await this.attemptRepository.find({
      where: { partnerExchangeId: In(exchangeIds) },
      order: { attemptNo: 'DESC' },
    });
    for (const attempt of attempts) {
      if (!map.has(attempt.partnerExchangeId)) {
        map.set(attempt.partnerExchangeId, attempt.result);
      }
    }
    return map;
  }
}
