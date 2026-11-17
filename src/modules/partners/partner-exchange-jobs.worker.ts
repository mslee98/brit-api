import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { hostname } from 'os';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

import {
  PARTNER_EXCHANGE_JOB_BATCH_SIZE,
  PARTNER_EXCHANGE_JOB_INTERVAL_MS,
  PARTNER_EXCHANGE_JOB_LEASE_MS,
  PARTNER_EXCHANGE_JOB_RECON_AFTER_ATTEMPTS,
} from './domain/constants/partner-exchange-job.constants';
import { PartnerExchangeAttemptType } from './domain/enums/partner-exchange-attempt-type.enum';
import { PartnerExchangeJobStatus } from './domain/enums/partner-exchange-job-status.enum';
import { PartnerExchangeJobType } from './domain/enums/partner-exchange-job-type.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerExchangeAttemptEntity } from './infrastructure/entities/partner-exchange-attempt.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerExchangeJobEntity } from './infrastructure/entities/partner-exchange-job.entity';
import { PartnerChargeSettlementService } from './partner-charge-settlement.service';
import { PartnerExchangeJobsService } from './partner-exchange-jobs.service';
import { PartnerOperationsService } from './partner-operations.service';
import { isTerminalExternalResult } from './utils/partner-external-result.util';

type ClaimedJob = {
  job: PartnerExchangeJobEntity;
  lockedBy: string;
  fenceToken: string;
};

/** Worker 처리 결과. exchange.status narrowing에 묶이지 않도록 전체 enum을 유지한다. */
type PartnerExchangeJobOutcome = {
  status: PartnerExchangeStatus;
  externalResultStatus: PartnerExternalResultStatus;
  settledStatus: PartnerExchangeStatus | null;
};

/**
 * B4-4: 지급 Outbox Worker.
 * - Lease 획득 후 HTTP는 트랜잭션 밖
 * - 불명 시 STATUS 우선 (신규 거래번호 CREDIT 금지)
 * - settle/sync는 B4-2/B4-3 서비스 재사용
 */
@Injectable()
export class PartnerExchangeJobsWorker {
  private readonly logger = new Logger(PartnerExchangeJobsWorker.name);
  private isRunning = false;
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jobsService: PartnerExchangeJobsService,
    private readonly operationsService: PartnerOperationsService,
    private readonly chargeSettlementService: PartnerChargeSettlementService,
  ) {}

  @Interval(PARTNER_EXCHANGE_JOB_INTERVAL_MS)
  async processBatch(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const claimed = await this.claimPendingBatch();
      for (const item of claimed) {
        try {
          await this.processJob(item);
        } catch (error) {
          this.logger.warn(
            `exchange job failed id=${item.job.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          await this.jobsService.reschedule(
            item.job.id,
            item.lockedBy,
            item.fenceToken,
            {
              jobType: PartnerExchangeJobType.STATUS_SYNC,
              status: PartnerExchangeJobStatus.PENDING,
              delayMs: this.jobsService.nextBackoffMs(
                item.job.attemptCount,
                false,
              ),
              lastErrorCode: 'WORKER_EXCEPTION',
            },
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `exchange job batch failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async claimPendingBatch(): Promise<ClaimedJob[]> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `
        SELECT id
        FROM partner_exchange_jobs
        WHERE (
            status = $1
            AND next_run_at <= NOW()
          )
          OR (
            status = $2
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < NOW()
          )
          OR (
            status = $3
            AND next_run_at <= NOW()
          )
        ORDER BY next_run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $4
        `,
        [
          PartnerExchangeJobStatus.PENDING,
          PartnerExchangeJobStatus.CLAIMED,
          PartnerExchangeJobStatus.MANUAL_REVIEW,
          PARTNER_EXCHANGE_JOB_BATCH_SIZE,
        ],
      );
      if (rows.length === 0) {
        return [];
      }

      const repo = manager.getRepository(PartnerExchangeJobEntity);
      const claimed: ClaimedJob[] = [];
      const now = Date.now();
      for (const row of rows) {
        const job = await repo.findOne({ where: { id: row.id } });
        if (!job) {
          continue;
        }
        const fence = String(BigInt(job.fenceToken || '0') + 1n);
        job.status = PartnerExchangeJobStatus.CLAIMED;
        job.attemptCount += 1;
        job.lockedBy = this.workerId;
        job.leaseExpiresAt = new Date(now + PARTNER_EXCHANGE_JOB_LEASE_MS);
        job.fenceToken = fence;
        job.nextRunAt = new Date(now + PARTNER_EXCHANGE_JOB_LEASE_MS);
        const saved = await repo.save(job);
        claimed.push({
          job: saved,
          lockedBy: this.workerId,
          fenceToken: fence,
        });
      }
      return claimed;
    });
  }

  private async processJob(item: ClaimedJob): Promise<void> {
    const exchange = await this.dataSource
      .getRepository(PartnerExchangeEntity)
      .findOne({ where: { id: item.job.partnerExchangeId } });
    if (!exchange) {
      await this.jobsService.reschedule(
        item.job.id,
        item.lockedBy,
        item.fenceToken,
        {
          jobType: item.job.jobType,
          status: PartnerExchangeJobStatus.FAILED,
          delayMs: 0,
          lastErrorCode: 'EXCHANGE_NOT_FOUND',
        },
      );
      return;
    }

    if (
      exchange.status === PartnerExchangeStatus.COMPLETED ||
      exchange.status === PartnerExchangeStatus.FAILED_CONFIRMED
    ) {
      await this.jobsService.markCompleted(
        item.job.id,
        item.lockedBy,
        item.fenceToken,
      );
      return;
    }

    // 외부 최종 증거가 있으면 STATUS HTTP 없이 내부 settle만 재시도
    if (isTerminalExternalResult(exchange.externalResultStatus)) {
      const settled =
        await this.chargeSettlementService.settleIfTerminal(exchange.id);
      const fresh = await this.dataSource
        .getRepository(PartnerExchangeEntity)
        .findOneOrFail({ where: { id: exchange.id } });
      await this.finishAfterOutcome(item, {
        status: fresh.status,
        externalResultStatus: fresh.externalResultStatus,
        settledStatus: settled?.status ?? null,
      });
      return;
    }

    const creditAttempts = await this.dataSource
      .getRepository(PartnerExchangeAttemptEntity)
      .find({
        where: {
          partnerExchangeId: exchange.id,
          attemptType: PartnerExchangeAttemptType.CREDIT,
        },
        order: { attemptNo: 'ASC' },
      });

    const action = this.decideAction(exchange, creditAttempts, item.job);
    let outcome: PartnerExchangeJobOutcome = {
      status: exchange.status,
      externalResultStatus: exchange.externalResultStatus,
      settledStatus: null,
    };

    if (action === 'CREDIT') {
      const result = await this.operationsService.startPartnerCredit(
        exchange.id,
      );
      outcome = {
        status: result.status,
        externalResultStatus: result.externalResultStatus,
        settledStatus: result.settledStatus ?? null,
      };
    } else if (action === 'STATUS') {
      const result = await this.operationsService.syncPartnerResult(
        exchange.id,
      );
      outcome = {
        status: result.status,
        externalResultStatus: result.externalResultStatus,
        settledStatus: result.settledStatus ?? null,
      };

      // STATUS가 미처리(NOT_FOUND→UNKNOWN)이고 CREDIT 이력이 불명이면
      // 동일 exchangeId 멱등 CREDIT 1회는 startPartnerCredit이 거부할 수 있음.
      // ASSET_LOCKED + NOT_REQUESTED 만 CREDIT — 그 외는 STATUS 재조회.
      if (
        outcome.status === PartnerExchangeStatus.ASSET_LOCKED &&
        outcome.externalResultStatus ===
          PartnerExternalResultStatus.NOT_REQUESTED
      ) {
        const credit = await this.operationsService.startPartnerCredit(
          exchange.id,
        );
        outcome = {
          status: credit.status,
          externalResultStatus: credit.externalResultStatus,
          settledStatus: credit.settledStatus ?? null,
        };
      }
    }

    await this.finishAfterOutcome(item, outcome);
  }

  private decideAction(
    exchange: PartnerExchangeEntity,
    creditAttempts: PartnerExchangeAttemptEntity[],
    job: PartnerExchangeJobEntity,
  ): 'CREDIT' | 'STATUS' {
    if (
      exchange.status === PartnerExchangeStatus.RECONCILIATION_REQUIRED ||
      job.status === PartnerExchangeJobStatus.MANUAL_REVIEW ||
      job.jobType === PartnerExchangeJobType.STATUS_SYNC ||
      job.jobType === PartnerExchangeJobType.SETTLE
    ) {
      return 'STATUS';
    }

    if (creditAttempts.length === 0) {
      // CREDIT을 한 번도 예약하지 않은 것이 DB상 확실할 때만 최초 CREDIT
      if (
        exchange.status === PartnerExchangeStatus.ASSET_LOCKED &&
        exchange.externalResultStatus ===
          PartnerExternalResultStatus.NOT_REQUESTED
      ) {
        return 'CREDIT';
      }
      return 'STATUS';
    }

    // Attempt REQUESTED만으로 호출 여부를 단정하지 않음 → STATUS 우선
    return 'STATUS';
  }

  private async finishAfterOutcome(
    item: ClaimedJob,
    outcome: PartnerExchangeJobOutcome,
  ): Promise<void> {
    const terminalExchange =
      outcome.status === PartnerExchangeStatus.COMPLETED ||
      outcome.status === PartnerExchangeStatus.FAILED_CONFIRMED ||
      outcome.settledStatus === PartnerExchangeStatus.COMPLETED ||
      outcome.settledStatus === PartnerExchangeStatus.FAILED_CONFIRMED;

    if (terminalExchange) {
      await this.jobsService.markCompleted(
        item.job.id,
        item.lockedBy,
        item.fenceToken,
      );
      return;
    }

    const needsRecon =
      item.job.attemptCount >= PARTNER_EXCHANGE_JOB_RECON_AFTER_ATTEMPTS &&
      !isTerminalExternalResult(outcome.externalResultStatus);

    if (needsRecon) {
      await this.dataSource
        .getRepository(PartnerExchangeEntity)
        .createQueryBuilder()
        .update(PartnerExchangeEntity)
        .set({ status: PartnerExchangeStatus.RECONCILIATION_REQUIRED })
        .where('id = :id', { id: item.job.partnerExchangeId })
        .andWhere('status IN (:...statuses)', {
          statuses: [
            PartnerExchangeStatus.ASSET_LOCKED,
            PartnerExchangeStatus.PARTNER_PROCESSING,
          ],
        })
        .execute();

      await this.jobsService.reschedule(
        item.job.id,
        item.lockedBy,
        item.fenceToken,
        {
          jobType: PartnerExchangeJobType.STATUS_SYNC,
          status: PartnerExchangeJobStatus.MANUAL_REVIEW,
          delayMs: this.jobsService.nextBackoffMs(item.job.attemptCount, true),
          lastErrorCode: 'RECONCILIATION_REQUIRED',
        },
      );
      return;
    }

    await this.jobsService.reschedule(
      item.job.id,
      item.lockedBy,
      item.fenceToken,
      {
        jobType: PartnerExchangeJobType.STATUS_SYNC,
        status: PartnerExchangeJobStatus.PENDING,
        delayMs: this.jobsService.nextBackoffMs(item.job.attemptCount, false),
        lastErrorCode: this.errorCodeFor(outcome.externalResultStatus),
      },
    );
  }

  private errorCodeFor(
    external: PartnerExternalResultStatus,
  ): string | null {
    switch (external) {
      case PartnerExternalResultStatus.PROCESSING:
        return 'PARTNER_PROCESSING';
      case PartnerExternalResultStatus.UNKNOWN:
        return 'EXTERNAL_UNKNOWN';
      case PartnerExternalResultStatus.NOT_FOUND:
        return 'EXTERNAL_NOT_FOUND';
      case PartnerExternalResultStatus.NOT_REQUESTED:
        return 'CREDIT_PENDING';
      default:
        return null;
    }
  }
}
