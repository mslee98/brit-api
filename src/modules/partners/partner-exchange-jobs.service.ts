import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  PARTNER_EXCHANGE_JOB_BACKOFF_MS,
  PARTNER_EXCHANGE_JOB_RECON_BACKOFF_MS,
} from './domain/constants/partner-exchange-job.constants';
import { PartnerExchangeJobStatus } from './domain/enums/partner-exchange-job-status.enum';
import { PartnerExchangeJobType } from './domain/enums/partner-exchange-job-type.enum';
import { PartnerExchangeJobEntity } from './infrastructure/entities/partner-exchange-job.entity';

/**
 * B4-4: 지급 Outbox enqueue / 완료·재예약.
 * Worker claim은 PartnerExchangeJobsWorker가 담당한다.
 */
@Injectable()
export class PartnerExchangeJobsService {
  constructor(
    @InjectRepository(PartnerExchangeJobEntity)
    private readonly jobRepository: Repository<PartnerExchangeJobEntity>,
  ) {}

  /**
   * 잠금 트랜잭션 안에서 CREDIT 작업을 넣는다.
   * Exchange당 1행(유니크). 이미 있으면 그대로 둔다.
   */
  async enqueueCreditJobInTransaction(
    manager: EntityManager,
    partnerExchangeId: string,
    now: Date = new Date(),
  ): Promise<PartnerExchangeJobEntity> {
    const jobRepo = manager.getRepository(PartnerExchangeJobEntity);
    const existing = await jobRepo.findOne({
      where: { partnerExchangeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      return existing;
    }
    return jobRepo.save(
      jobRepo.create({
        partnerExchangeId,
        jobType: PartnerExchangeJobType.CREDIT,
        status: PartnerExchangeJobStatus.PENDING,
        attemptCount: 0,
        nextRunAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        fenceToken: '0',
        lastErrorCode: null,
        completedAt: null,
      }),
    );
  }

  /** 멱등 경로 등 트랜잭션 밖에서 job 보장 */
  async ensureCreditJob(partnerExchangeId: string): Promise<void> {
    const existing = await this.jobRepository.findOne({
      where: { partnerExchangeId },
    });
    if (existing) {
      return;
    }
    try {
      await this.jobRepository.save(
        this.jobRepository.create({
          partnerExchangeId,
          jobType: PartnerExchangeJobType.CREDIT,
          status: PartnerExchangeJobStatus.PENDING,
          attemptCount: 0,
          nextRunAt: new Date(),
          lockedBy: null,
          leaseExpiresAt: null,
          fenceToken: '0',
          lastErrorCode: null,
          completedAt: null,
        }),
      );
    } catch {
      // 유니크 경합 — 다른 경로가 이미 생성
    }
  }

  nextBackoffMs(attemptCount: number, reconciliation: boolean): number {
    if (reconciliation) {
      return PARTNER_EXCHANGE_JOB_RECON_BACKOFF_MS;
    }
    const idx = Math.min(
      Math.max(attemptCount - 1, 0),
      PARTNER_EXCHANGE_JOB_BACKOFF_MS.length - 1,
    );
    return PARTNER_EXCHANGE_JOB_BACKOFF_MS[idx] ?? 600_000;
  }

  async markCompleted(
    jobId: string,
    lockedBy: string,
    fenceToken: string,
  ): Promise<boolean> {
    const result = await this.jobRepository
      .createQueryBuilder()
      .update(PartnerExchangeJobEntity)
      .set({
        status: PartnerExchangeJobStatus.COMPLETED,
        completedAt: () => 'NOW()',
        lockedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
      })
      .where('id = :jobId', { jobId })
      .andWhere('locked_by = :lockedBy', { lockedBy })
      .andWhere('fence_token = :fenceToken', { fenceToken })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async reschedule(
    jobId: string,
    lockedBy: string,
    fenceToken: string,
    input: {
      jobType: PartnerExchangeJobType;
      status: PartnerExchangeJobStatus;
      delayMs: number;
      lastErrorCode: string | null;
    },
  ): Promise<boolean> {
    const result = await this.jobRepository
      .createQueryBuilder()
      .update(PartnerExchangeJobEntity)
      .set({
        jobType: input.jobType,
        status: input.status,
        nextRunAt: new Date(Date.now() + input.delayMs),
        lockedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: input.lastErrorCode,
      })
      .where('id = :jobId', { jobId })
      .andWhere('locked_by = :lockedBy', { lockedBy })
      .andWhere('fence_token = :fenceToken', { fenceToken })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
