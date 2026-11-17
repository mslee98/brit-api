import { DataSource } from 'typeorm';

import { PartnerExchangeJobStatus } from './domain/enums/partner-exchange-job-status.enum';
import { PartnerExchangeJobType } from './domain/enums/partner-exchange-job-type.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerExchangeAttemptEntity } from './infrastructure/entities/partner-exchange-attempt.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerExchangeJobEntity } from './infrastructure/entities/partner-exchange-job.entity';
import { PartnerChargeSettlementService } from './partner-charge-settlement.service';
import { PartnerExchangeJobsService } from './partner-exchange-jobs.service';
import { PartnerExchangeJobsWorker } from './partner-exchange-jobs.worker';
import { PartnerOperationsService } from './partner-operations.service';

describe('PartnerExchangeJobsWorker', () => {
  const exchangeId = 'ex-1';
  const jobId = 'job-1';

  let worker: PartnerExchangeJobsWorker;
  let dataSource: {
    transaction: jest.Mock;
    getRepository: jest.Mock;
  };
  let jobsService: {
    markCompleted: jest.Mock;
    reschedule: jest.Mock;
    nextBackoffMs: jest.Mock;
  };
  let operationsService: {
    startPartnerCredit: jest.Mock;
    syncPartnerResult: jest.Mock;
  };
  let chargeSettlementService: {
    settleIfTerminal: jest.Mock;
  };
  let exchangeRepo: { findOne: jest.Mock; findOneOrFail: jest.Mock };
  let attemptRepo: { find: jest.Mock };

  beforeEach(() => {
    exchangeRepo = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
    };
    attemptRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
        fn({
          query: jest.fn().mockResolvedValue([{ id: jobId }]),
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue({
              id: jobId,
              partnerExchangeId: exchangeId,
              jobType: PartnerExchangeJobType.CREDIT,
              status: PartnerExchangeJobStatus.PENDING,
              attemptCount: 0,
              fenceToken: '0',
              lockedBy: null,
              leaseExpiresAt: null,
              nextRunAt: new Date(),
            } as PartnerExchangeJobEntity),
            save: jest.fn(async (job: PartnerExchangeJobEntity) => job),
          }),
        }),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === PartnerExchangeAttemptEntity) {
          return attemptRepo;
        }
        if (entity === PartnerExchangeEntity) {
          return exchangeRepo;
        }
        return {};
      }),
    };

    jobsService = {
      markCompleted: jest.fn().mockResolvedValue(true),
      reschedule: jest.fn().mockResolvedValue(true),
      nextBackoffMs: jest.fn().mockReturnValue(5_000),
    };
    operationsService = {
      startPartnerCredit: jest.fn().mockResolvedValue({
        exchangeId,
        status: PartnerExchangeStatus.PARTNER_PROCESSING,
        externalResultStatus: PartnerExternalResultStatus.PROCESSING,
        partnerTransactionId: null,
        skipped: false,
        skipReason: null,
        settledStatus: null,
      }),
      syncPartnerResult: jest.fn().mockResolvedValue({
        exchangeId,
        status: PartnerExchangeStatus.COMPLETED,
        externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
        partnerTransactionId: 'ptx-1',
        skipped: false,
        skipReason: null,
        settledStatus: PartnerExchangeStatus.COMPLETED,
      }),
    };
    chargeSettlementService = {
      settleIfTerminal: jest.fn().mockResolvedValue({
        exchangeId,
        status: PartnerExchangeStatus.COMPLETED,
        externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
        intentStatus: null,
        alreadySettled: false,
      }),
    };

    worker = new PartnerExchangeJobsWorker(
      dataSource as unknown as DataSource,
      jobsService as unknown as PartnerExchangeJobsService,
      operationsService as unknown as PartnerOperationsService,
      chargeSettlementService as unknown as PartnerChargeSettlementService,
    );
  });

  it('ASSET_LOCKED + CREDIT attempt 없음 → startPartnerCredit', async () => {
    exchangeRepo.findOne.mockResolvedValue({
      id: exchangeId,
      status: PartnerExchangeStatus.ASSET_LOCKED,
      externalResultStatus: PartnerExternalResultStatus.NOT_REQUESTED,
    });
    attemptRepo.find.mockResolvedValue([]);

    await worker.processBatch();

    expect(operationsService.startPartnerCredit).toHaveBeenCalledWith(
      exchangeId,
    );
    expect(operationsService.syncPartnerResult).not.toHaveBeenCalled();
    expect(jobsService.reschedule).toHaveBeenCalled();
  });

  it('CREDIT attempt 존재 → STATUS 우선, CREDIT 재호출 없음', async () => {
    exchangeRepo.findOne.mockResolvedValue({
      id: exchangeId,
      status: PartnerExchangeStatus.PARTNER_PROCESSING,
      externalResultStatus: PartnerExternalResultStatus.UNKNOWN,
    });
    attemptRepo.find.mockResolvedValue([
      { id: 'att-1', attemptType: 'CREDIT', result: 'REQUESTED' },
    ]);
    operationsService.syncPartnerResult.mockResolvedValue({
      exchangeId,
      status: PartnerExchangeStatus.PARTNER_PROCESSING,
      externalResultStatus: PartnerExternalResultStatus.PROCESSING,
      partnerTransactionId: null,
      skipped: false,
      skipReason: null,
      settledStatus: null,
    });

    await worker.processBatch();

    expect(operationsService.syncPartnerResult).toHaveBeenCalledWith(
      exchangeId,
    );
    expect(operationsService.startPartnerCredit).not.toHaveBeenCalled();
  });

  it('COMPLETED Exchange → job markCompleted, 외부 호출 없음', async () => {
    exchangeRepo.findOne.mockResolvedValue({
      id: exchangeId,
      status: PartnerExchangeStatus.COMPLETED,
      externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
    });

    await worker.processBatch();

    expect(jobsService.markCompleted).toHaveBeenCalled();
    expect(operationsService.startPartnerCredit).not.toHaveBeenCalled();
    expect(operationsService.syncPartnerResult).not.toHaveBeenCalled();
  });

  it('SUCCEEDED면 STATUS 없이 settle만 재시도 후 job 완료', async () => {
    exchangeRepo.findOne.mockResolvedValue({
      id: exchangeId,
      status: PartnerExchangeStatus.PARTNER_PROCESSING,
      externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
    });
    exchangeRepo.findOneOrFail.mockResolvedValue({
      id: exchangeId,
      status: PartnerExchangeStatus.COMPLETED,
      externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
    });
    attemptRepo.find.mockResolvedValue([{ id: 'att-1' }]);

    await worker.processBatch();

    expect(chargeSettlementService.settleIfTerminal).toHaveBeenCalledWith(
      exchangeId,
    );
    expect(operationsService.syncPartnerResult).not.toHaveBeenCalled();
    expect(jobsService.markCompleted).toHaveBeenCalled();
  });
});
