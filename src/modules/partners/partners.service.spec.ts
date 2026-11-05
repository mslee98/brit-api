import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';

import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { PartnersService } from './partners.service';

describe('PartnersService', () => {
  let service: PartnersService;
  let partnerRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let partnerRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditLogService: { writeInTransaction: jest.Mock };

  const actorUserId = 'admin-1';
  const now = new Date('2026-11-05T01:00:00.000Z');

  const runTransaction = async <T>(
    work: (manager: {
      getRepository: (entity: unknown) => unknown;
    }) => Promise<T>,
  ): Promise<T> => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === PartnerEntity) return partnerRepo;
        throw new Error(`unexpected repository: ${String(entity)}`);
      },
    };
    return work(manager);
  };

  beforeEach(async () => {
    partnerRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (row) => ({
        ...row,
        id: row.id ?? 'partner-1',
        createdAt: row.createdAt ?? now,
        updatedAt: row.updatedAt ?? now,
      })),
    };
    partnerRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    auditLogService = {
      writeInTransaction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnersService,
        {
          provide: DataSource,
          useValue: { transaction: jest.fn(runTransaction) },
        },
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: partnerRepository,
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
      ],
    }).compile();

    service = module.get(PartnersService);
  });

  describe('createPartner', () => {
    it('ACTIVE로 생성하고 CREATE_PARTNER 감사를 남긴다', async () => {
      const result = await service.createPartner(
        actorUserId,
        {
          code: 'shop_a',
          name: '에이샵',
          contactName: '김담당',
          contactPhone: '01012345678',
          contactEmail: 'Ops@Shop.A',
          reason: '메신저 접수',
        },
        '127.0.0.1',
      );

      expect(result.status).toBe(PartnerStatus.ACTIVE);
      expect(result.code).toBe('SHOP_A');
      expect(result.contactEmail).toBe('ops@shop.a');
      expect(partnerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SHOP_A',
          status: PartnerStatus.ACTIVE,
        }),
      );
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actorUserId,
          actionType: AuditActionType.CREATE_PARTNER,
          targetType: AuditTargetType.PARTNER,
          targetId: 'partner-1',
          reason: '메신저 접수',
          ipAddress: '127.0.0.1',
        }),
      );
    });

    it('code 중복이면 PARTNER_CODE_DUPLICATE', async () => {
      const driverError = { code: '23505' };
      partnerRepo.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], driverError as never),
      );

      await expect(
        service.createPartner(
          actorUserId,
          {
            code: 'SHOP_A',
            name: '에이샵',
            contactName: '김담당',
            contactPhone: '01012345678',
            contactEmail: 'ops@shop.a',
            reason: '중복',
          },
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_CODE_DUPLICATE' },
      });
      expect(auditLogService.writeInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('changePartnerStatus', () => {
    it('ACTIVE → SUSPENDED 전이와 감사를 남긴다', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: 'partner-1',
        status: PartnerStatus.ACTIVE,
      });

      await service.suspendPartner(
        actorUserId,
        'partner-1',
        '점검',
        '10.0.0.1',
      );

      expect(partnerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PartnerStatus.SUSPENDED }),
      );
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.SUSPEND_PARTNER,
          beforeData: { status: PartnerStatus.ACTIVE },
          afterData: { status: PartnerStatus.SUSPENDED },
          reason: '점검',
        }),
      );
    });

    it('TERMINATED에서 resume이면 PARTNER_INVALID_STATUS_TRANSITION', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: 'partner-1',
        status: PartnerStatus.TERMINATED,
      });

      await expect(
        service.resumePartner(actorUserId, 'partner-1', '재활성', null),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.resumePartner(actorUserId, 'partner-1', '재활성', null),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_INVALID_STATUS_TRANSITION' },
      });
      expect(partnerRepo.save).not.toHaveBeenCalled();
    });

    it('SUSPENDED → ACTIVE resume', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: 'partner-1',
        status: PartnerStatus.SUSPENDED,
      });

      await service.resumePartner(actorUserId, 'partner-1', '재개', null);

      expect(partnerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PartnerStatus.ACTIVE }),
      );
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.RESUME_PARTNER,
        }),
      );
    });
  });

  describe('findAdminDetail', () => {
    it('없으면 PARTNER_NOT_FOUND', async () => {
      partnerRepository.findOne.mockResolvedValue(null);

      await expect(service.findAdminDetail('missing')).rejects.toMatchObject({
        response: { code: 'PARTNER_NOT_FOUND' },
      });
    });
  });

  describe('createPartner race', () => {
    it('비-unique 오류는 그대로 전파한다', async () => {
      partnerRepo.save.mockRejectedValue(new ConflictException('other'));

      await expect(
        service.createPartner(
          actorUserId,
          {
            code: 'X',
            name: 'X',
            contactName: 'A',
            contactPhone: '1',
            contactEmail: 'a@b.c',
            reason: 'r',
          },
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
