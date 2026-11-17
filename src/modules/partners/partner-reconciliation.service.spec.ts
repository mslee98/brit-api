import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { PartnerExchangeOpsNoteAction } from './domain/enums/partner-exchange-ops-note-action.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerWebhookDeliveryStatus } from './domain/enums/partner-webhook-delivery-status.enum';
import { PartnerReconciliationService } from './partner-reconciliation.service';

describe('PartnerReconciliationService', () => {
  const partnerId = 'partner-1';
  const exchangeId = 'exchange-1';
  const actorUserId = 'admin-1';

  function buildService(overrides?: {
    exchange?: Record<string, unknown> | null;
    settleResult?: Record<string, unknown> | null;
    syncResult?: Record<string, unknown>;
    delivery?: Record<string, unknown> | null;
    event?: Record<string, unknown> | null;
  }) {
    const exchange = overrides?.exchange ?? {
      id: exchangeId,
      partnerId,
      status: PartnerExchangeStatus.RECONCILIATION_REQUIRED,
      externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
      exchangeNumber: 'PEX-1',
      amount: '1000',
      partnerTransactionId: 'ptx-1',
      failureCode: null,
      failureMessage: null,
    };

    const noteEntity = {
      id: 'note-1',
      partnerExchangeId: exchangeId,
      authorUserId: actorUserId,
      action: PartnerExchangeOpsNoteAction.NOTE,
      note: '조사 메모',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const exchangeRepository = {
      findOne: jest.fn().mockResolvedValue(exchange),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const attemptRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const lotRepository = { find: jest.fn().mockResolvedValue([]) };
    const eventRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(
        overrides?.event ?? {
          id: 'event-1',
          partnerExchangeId: exchangeId,
        },
      ),
    };
    const jobRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const noteRepository = {
      create: jest.fn((row) => row),
      save: jest.fn().mockImplementation(async (row) => ({
        ...noteEntity,
        ...row,
        id: 'note-saved',
        createdAt: noteEntity.createdAt,
      })),
      find: jest.fn().mockResolvedValue([]),
    };
    const deliveryRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(overrides?.delivery ?? null),
      save: jest.fn().mockImplementation(async (row) => row),
      count: jest.fn(),
    };
    const intentRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const partnerRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({ id: partnerId, name: 'Shop' }),
    };
    const operationsService = {
      syncPartnerResult: jest.fn().mockResolvedValue(
        overrides?.syncResult ?? {
          status: PartnerExchangeStatus.COMPLETED,
          externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
          settledStatus: PartnerExchangeStatus.COMPLETED,
        },
      ),
    };
    const chargeSettlementService = {
      settleIfTerminal: jest
        .fn()
        .mockResolvedValue(
          overrides?.settleResult === undefined
            ? {
                status: PartnerExchangeStatus.COMPLETED,
                externalResultStatus: PartnerExternalResultStatus.SUCCEEDED,
                alreadySettled: false,
              }
            : overrides.settleResult,
        ),
    };
    const auditLogService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const service = new PartnerReconciliationService(
      exchangeRepository as never,
      attemptRepository as never,
      lotRepository as never,
      eventRepository as never,
      jobRepository as never,
      noteRepository as never,
      deliveryRepository as never,
      intentRepository as never,
      partnerRepository as never,
      operationsService as never,
      chargeSettlementService as never,
      auditLogService as never,
    );

    return {
      service,
      exchangeRepository,
      noteRepository,
      deliveryRepository,
      eventRepository,
      operationsService,
      chargeSettlementService,
      auditLogService,
    };
  }

  describe('priorityOf', () => {
    it('SUCCEEDED 미완료는 HIGH, recon은 MEDIUM, 그 외 LOW', () => {
      const { service } = buildService();
      expect(
        service.priorityOf(
          PartnerExchangeStatus.PARTNER_PROCESSING,
          PartnerExternalResultStatus.SUCCEEDED,
        ),
      ).toBe('HIGH');
      expect(
        service.priorityOf(
          PartnerExchangeStatus.RECONCILIATION_REQUIRED,
          PartnerExternalResultStatus.UNKNOWN,
        ),
      ).toBe('MEDIUM');
      expect(
        service.priorityOf(
          PartnerExchangeStatus.PARTNER_PROCESSING,
          PartnerExternalResultStatus.UNKNOWN,
        ),
      ).toBe('LOW');
    });
  });

  describe('settle', () => {
    it('UNKNOWN(비터미널)이면 settlementNotReady를 던진다', async () => {
      const { service, chargeSettlementService, auditLogService } = buildService(
        {
          exchange: {
            id: exchangeId,
            partnerId,
            status: PartnerExchangeStatus.PARTNER_PROCESSING,
            externalResultStatus: PartnerExternalResultStatus.UNKNOWN,
          },
          settleResult: null,
        },
      );

      await expect(
        service.settle(actorUserId, partnerId, exchangeId, '127.0.0.1', null),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_SETTLEMENT_NOT_READY' },
      });
      expect(chargeSettlementService.settleIfTerminal).toHaveBeenCalledWith(
        exchangeId,
      );
      expect(auditLogService.write).not.toHaveBeenCalled();
    });

    it('성공 시 audit SETTLE_PARTNER_EXCHANGE를 남긴다', async () => {
      const { service, auditLogService, noteRepository } = buildService();

      await service.settle(
        actorUserId,
        partnerId,
        exchangeId,
        '127.0.0.1',
        '확정 반영',
      );

      expect(noteRepository.save).toHaveBeenCalled();
      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          actionType: AuditActionType.SETTLE_PARTNER_EXCHANGE,
          targetType: AuditTargetType.PARTNER_EXCHANGE,
          targetId: exchangeId,
          reason: '확정 반영',
        }),
      );
    });
  });

  describe('sync', () => {
    it('partner mismatch면 거절하고 sync/audit를 호출하지 않는다', async () => {
      const { service, operationsService, auditLogService } = buildService({
        exchange: {
          id: exchangeId,
          partnerId: 'other-partner',
          status: PartnerExchangeStatus.PARTNER_PROCESSING,
          externalResultStatus: PartnerExternalResultStatus.UNKNOWN,
        },
      });

      await expect(
        service.sync(actorUserId, partnerId, exchangeId, null, null),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_EXCHANGE_PARTNER_MISMATCH' },
      });
      expect(operationsService.syncPartnerResult).not.toHaveBeenCalled();
      expect(auditLogService.write).not.toHaveBeenCalled();
    });

    it('성공 시 audit SYNC_PARTNER_EXCHANGE를 남긴다', async () => {
      const { service, operationsService, auditLogService } = buildService();

      await service.sync(
        actorUserId,
        partnerId,
        exchangeId,
        '10.0.0.1',
        'STATUS 재조회',
      );

      expect(operationsService.syncPartnerResult).toHaveBeenCalledWith(
        exchangeId,
      );
      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.SYNC_PARTNER_EXCHANGE,
          targetType: AuditTargetType.PARTNER_EXCHANGE,
          targetId: exchangeId,
        }),
      );
    });
  });

  describe('addNote', () => {
    it('메모를 저장하고 audit NOTE를 남긴다', async () => {
      const { service, noteRepository, auditLogService } = buildService();

      const saved = await service.addNote(
        actorUserId,
        partnerId,
        exchangeId,
        { note: ' 업체 확인 중 ', reason: '조사' },
        '127.0.0.1',
      );

      expect(noteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerExchangeId: exchangeId,
          authorUserId: actorUserId,
          action: PartnerExchangeOpsNoteAction.NOTE,
          note: '업체 확인 중',
        }),
      );
      expect(saved.note).toBe('업체 확인 중');
      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.NOTE_PARTNER_EXCHANGE_RECON,
          targetType: AuditTargetType.PARTNER_EXCHANGE,
        }),
      );
    });
  });

  describe('retryWebhookDelivery', () => {
    it('Delivery를 PENDING으로 되돌리고 audit를 남긴다', async () => {
      const delivery = {
        id: 'del-1',
        partnerExchangeEventId: 'event-1',
        status: PartnerWebhookDeliveryStatus.FAILED,
        nextAttemptAt: new Date('2026-01-01T00:00:00.000Z'),
        lockedBy: 'worker-1',
        leaseExpiresAt: new Date(),
        lastError: 'timeout',
      };
      const { service, deliveryRepository, auditLogService } = buildService({
        delivery,
        event: { id: 'event-1', partnerExchangeId: exchangeId },
      });

      const result = await service.retryWebhookDelivery(
        actorUserId,
        partnerId,
        'del-1',
        null,
        null,
      );

      expect(result.status).toBe(PartnerWebhookDeliveryStatus.PENDING);
      expect(deliveryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PartnerWebhookDeliveryStatus.PENDING,
          lockedBy: null,
          lastError: null,
        }),
      );
      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.RETRY_PARTNER_WEBHOOK_DELIVERY,
        }),
      );
    });
  });
});
