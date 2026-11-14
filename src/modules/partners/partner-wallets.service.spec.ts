import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerWalletsService } from './partner-wallets.service';

describe('PartnerWalletsService', () => {
  const partnerId = 'partner-1';
  const manager = {};
  let partnerRepository: { findOne: jest.Mock };
  let partnerCoinService: {
    getWalletSummary: jest.Mock;
    updateCreditLimit: jest.Mock;
  };
  let auditLogService: { writeInTransaction: jest.Mock };
  let service: PartnerWalletsService;

  beforeEach(async () => {
    partnerRepository = {
      findOne: jest.fn().mockResolvedValue({ id: partnerId }),
    };
    partnerCoinService = {
      getWalletSummary: jest.fn().mockResolvedValue({
        availableBalance: '-10000',
        lockedBalance: '0',
        creditLimit: '0',
        remainingCredit: '-10000',
      }),
      updateCreditLimit: jest.fn().mockResolvedValue({
        availableBalance: '-10000',
        lockedBalance: '0',
        creditLimit: '50000',
        remainingCredit: '40000',
      }),
    };
    auditLogService = { writeInTransaction: jest.fn().mockResolvedValue({}) };

    const module = await Test.createTestingModule({
      providers: [
        PartnerWalletsService,
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: partnerRepository,
        },
        { provide: PartnerCoinService, useValue: partnerCoinService },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: DataSource,
          useValue: {
            manager,
            transaction: jest.fn((work: (m: unknown) => unknown) =>
              Promise.resolve(work(manager)),
            ),
          },
        },
      ],
    }).compile();
    service = module.get(PartnerWalletsService);
  });

  it('한도 변경 시 이전·이후 한도를 감사 로그에 남긴다', async () => {
    const result = await service.updateCreditLimit(
      'admin-1',
      partnerId,
      { creditLimit: '50000', reason: ' 보증금 확인 ' },
      '127.0.0.1',
    );

    expect(result.remainingCredit).toBe('40000');
    expect(partnerCoinService.updateCreditLimit).toHaveBeenCalledWith(
      manager,
      partnerId,
      '50000',
    );
    expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actionType: AuditActionType.UPDATE_PARTNER_CREDIT_LIMIT,
        targetId: partnerId,
        beforeData: { creditLimit: '0' },
        afterData: { creditLimit: '50000', availableBalance: '-10000' },
        reason: '보증금 확인',
      }),
    );
  });

  it('없는 업체면 PARTNER_NOT_FOUND', async () => {
    partnerRepository.findOne.mockResolvedValue(null);
    await expect(service.getWallet(partnerId)).rejects.toMatchObject({
      response: { code: 'PARTNER_NOT_FOUND' },
    });
  });
});
