import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import type { AuditLogService } from '../admins/audit-log.service';
import { PartnerClientEnvironment } from './domain/enums/partner-client-environment.enum';
import { PartnerClientScopeCode } from './domain/enums/partner-client-scope-code.enum';
import { PartnerClientStatus } from './domain/enums/partner-client-status.enum';
import { PartnerClientType } from './domain/enums/partner-client-type.enum';
import { PartnerMemberRole } from './domain/enums/partner-member-role.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import type { PartnerClientSecretEntity } from './infrastructure/entities/partner-client-secret.entity';
import type { PartnerClientEntity } from './infrastructure/entities/partner-client.entity';
import type { PartnerEntity } from './infrastructure/entities/partner.entity';
import {
  PORTAL_SANDBOX_CLIENT_LIMIT,
  PartnerClientsService,
  type PartnerPortalActor,
} from './partner-clients.service';

describe('PartnerClientsService (업체 포털)', () => {
  let service: PartnerClientsService;
  let partnerRepository: { findOne: jest.Mock };
  let clientRepository: { findOne: jest.Mock; count: jest.Mock };

  const partnerId = 'partner-1';
  const owner: PartnerPortalActor = {
    userId: 'user-owner',
    partnerId,
    memberRole: PartnerMemberRole.OWNER,
  };
  const manager: PartnerPortalActor = {
    ...owner,
    userId: 'user-manager',
    memberRole: PartnerMemberRole.MANAGER,
  };

  const serverCreateDto = {
    clientType: PartnerClientType.SERVER,
    name: 'Sandbox Server',
    scopes: [PartnerClientScopeCode.EXCHANGE_CHARGE],
  };

  const sandboxClient = {
    id: 'client-1',
    partnerId,
    environment: PartnerClientEnvironment.SANDBOX,
    clientType: PartnerClientType.SERVER,
    status: PartnerClientStatus.ACTIVE,
  } as PartnerClientEntity;

  beforeEach(() => {
    partnerRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: partnerId, status: PartnerStatus.ACTIVE }),
    };
    clientRepository = {
      findOne: jest.fn().mockResolvedValue(sandboxClient),
      count: jest.fn().mockResolvedValue(0),
    };
    service = new PartnerClientsService(
      partnerRepository as unknown as Repository<PartnerEntity>,
      clientRepository as unknown as Repository<PartnerClientEntity>,
      {} as Repository<PartnerClientSecretEntity>,
      {} as AuditLogService,
      {} as DataSource,
    );
  });

  describe('createPortalClient', () => {
    it('OWNER면 환경을 SANDBOX로 고정해 발급한다', async () => {
      const createClient = jest
        .spyOn(service, 'createClient')
        .mockResolvedValue({} as never);

      await service.createPortalClient(owner, serverCreateDto, '127.0.0.1');

      expect(createClient).toHaveBeenCalledWith(
        owner.userId,
        partnerId,
        expect.objectContaining({
          environment: PartnerClientEnvironment.SANDBOX,
          clientType: PartnerClientType.SERVER,
          webhookUrl: null,
        }),
        '127.0.0.1',
      );
    });

    it('MANAGER는 발급할 수 없다', async () => {
      await expect(
        service.createPortalClient(manager, serverCreateDto, null),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('정지된 업체는 발급할 수 없다', async () => {
      partnerRepository.findOne.mockResolvedValue({
        id: partnerId,
        status: PartnerStatus.SUSPENDED,
      });

      await expect(
        service.createPortalClient(owner, serverCreateDto, null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('허용 목록 밖 scope는 거절한다', async () => {
      await expect(
        service.createPortalClient(
          owner,
          {
            ...serverCreateDto,
            scopes: [PartnerClientScopeCode.BALANCE_READ],
          },
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_PORTAL_CLIENT_SCOPE_NOT_ALLOWED' },
      });
    });

    it('활성 Sandbox 키가 한도에 도달하면 거절한다', async () => {
      clientRepository.count.mockResolvedValue(PORTAL_SANDBOX_CLIENT_LIMIT);

      await expect(
        service.createPortalClient(owner, serverCreateDto, null),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_PORTAL_CLIENT_LIMIT_EXCEEDED' },
      });
    });
  });

  describe('rotatePortalClientSecret', () => {
    it('Sandbox 키는 재발급한다', async () => {
      const rotate = jest
        .spyOn(service, 'rotateApiSecret')
        .mockResolvedValue({} as never);

      await service.rotatePortalClientSecret(owner, sandboxClient.id, null);

      expect(rotate).toHaveBeenCalledWith(
        owner.userId,
        partnerId,
        sandboxClient.id,
        expect.any(String),
        null,
      );
    });

    it('Production 키는 포털에서 재발급할 수 없다', async () => {
      clientRepository.findOne.mockResolvedValue({
        ...sandboxClient,
        environment: PartnerClientEnvironment.PRODUCTION,
      });

      await expect(
        service.rotatePortalClientSecret(owner, sandboxClient.id, null),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_PORTAL_CLIENT_SANDBOX_ONLY' },
      });
    });

    it('다른 업체의 키는 찾을 수 없다', async () => {
      clientRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rotatePortalClientSecret(owner, 'other-client', null),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updatePortalClient', () => {
    it('이름·Origin만 전달한다', async () => {
      const update = jest
        .spyOn(service, 'updateClient')
        .mockResolvedValue({} as never);

      await service.updatePortalClient(
        owner,
        sandboxClient.id,
        { origins: ['http://localhost:5176'] },
        null,
      );

      expect(update).toHaveBeenCalledWith(
        owner.userId,
        partnerId,
        sandboxClient.id,
        {
          name: undefined,
          origins: ['http://localhost:5176'],
          reason: expect.any(String),
        },
        null,
      );
    });
  });
});
