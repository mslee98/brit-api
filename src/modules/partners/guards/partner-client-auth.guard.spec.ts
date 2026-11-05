import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import * as passwordUtil from '../../../common/utils/password.util';
import { PartnerClientScopeCode } from '../domain/enums/partner-client-scope-code.enum';
import { PartnerClientSecretStatus } from '../domain/enums/partner-client-secret-status.enum';
import { PartnerClientSecretType } from '../domain/enums/partner-client-secret-type.enum';
import { PartnerClientStatus } from '../domain/enums/partner-client-status.enum';
import { PartnerClientType } from '../domain/enums/partner-client-type.enum';
import { PartnerStatus } from '../domain/enums/partner-status.enum';
import { PartnerClientScopeEntity } from '../infrastructure/entities/partner-client-scope.entity';
import { PartnerClientSecretEntity } from '../infrastructure/entities/partner-client-secret.entity';
import { PartnerClientEntity } from '../infrastructure/entities/partner-client.entity';
import { PartnerEntity } from '../infrastructure/entities/partner.entity';
import {
  PARTNER_CLIENT_SCOPES_KEY,
  PartnerClientAuthGuard,
} from './partner-client-auth.guard';

jest.mock('../../../common/utils/password.util', () => ({
  verifySecret: jest.fn(),
}));

function mockContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('PartnerClientAuthGuard', () => {
  let guard: PartnerClientAuthGuard;
  let clientFindOne: jest.Mock;
  let secretFind: jest.Mock;
  let scopeFind: jest.Mock;
  let partnerFindOne: jest.Mock;
  let reflectorGet: jest.Mock;

  beforeEach(async () => {
    clientFindOne = jest.fn();
    secretFind = jest.fn();
    scopeFind = jest.fn();
    partnerFindOne = jest.fn();
    reflectorGet = jest.fn().mockReturnValue([]);
    (passwordUtil.verifySecret as jest.Mock).mockReset();

    const module = await Test.createTestingModule({
      providers: [
        PartnerClientAuthGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: reflectorGet },
        },
        {
          provide: getRepositoryToken(PartnerClientEntity),
          useValue: { findOne: clientFindOne },
        },
        {
          provide: getRepositoryToken(PartnerClientSecretEntity),
          useValue: { find: secretFind },
        },
        {
          provide: getRepositoryToken(PartnerClientScopeEntity),
          useValue: { find: scopeFind },
        },
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: { findOne: partnerFindOne },
        },
      ],
    }).compile();

    guard = module.get(PartnerClientAuthGuard);
  });

  function seedValidClient() {
    clientFindOne.mockResolvedValue({
      id: 'c1',
      partnerId: 'p1',
      clientId: 'cli_1',
      status: PartnerClientStatus.ACTIVE,
      clientType: PartnerClientType.SERVER,
    });
    partnerFindOne.mockResolvedValue({
      id: 'p1',
      status: PartnerStatus.ACTIVE,
    });
    secretFind.mockResolvedValue([
      {
        partnerClientId: 'c1',
        secretType: PartnerClientSecretType.API_SECRET,
        status: PartnerClientSecretStatus.ACTIVE,
        secretHash: 'hash',
      },
    ]);
    (passwordUtil.verifySecret as jest.Mock).mockResolvedValue(true);
  }

  it('유효한 Client Secret이면 partnerId를 주입한다', async () => {
    seedValidClient();
    const ctx = mockContext({
      'x-partner-client-id': 'cli_1',
      'x-partner-api-secret': 'secret',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest() as {
      partnerId?: string;
      partnerClientId?: string;
    };
    expect(req.partnerId).toBe('p1');
    expect(req.partnerClientId).toBe('c1');
  });

  it('헤더 없으면 AUTH_REQUIRED', async () => {
    await expect(guard.canActivate(mockContext({}))).rejects.toMatchObject({
      response: { code: 'PARTNER_CLIENT_AUTH_REQUIRED' },
    });
  });

  it('Secret 불일치면 AUTH_INVALID', async () => {
    seedValidClient();
    (passwordUtil.verifySecret as jest.Mock).mockResolvedValue(false);
    await expect(
      guard.canActivate(
        mockContext({
          'x-partner-client-id': 'cli_1',
          'x-partner-api-secret': 'bad',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_CLIENT_AUTH_INVALID' },
    });
  });

  it('필수 Scope 없으면 SCOPE_DENIED', async () => {
    seedValidClient();
    reflectorGet.mockReturnValue([PartnerClientScopeCode.EXCHANGE_CHARGE]);
    scopeFind.mockResolvedValue([]);
    await expect(
      guard.canActivate(
        mockContext({
          'x-partner-client-id': 'cli_1',
          'x-partner-api-secret': 'secret',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_CLIENT_SCOPE_DENIED' },
    });
    expect(reflectorGet).toHaveBeenCalledWith(
      PARTNER_CLIENT_SCOPES_KEY,
      expect.any(Array),
    );
  });

  it('SUSPENDED 업체면 거래 인증 거부', async () => {
    seedValidClient();
    partnerFindOne.mockResolvedValue({
      id: 'p1',
      status: PartnerStatus.SUSPENDED,
    });
    await expect(
      guard.canActivate(
        mockContext({
          'x-partner-client-id': 'cli_1',
          'x-partner-api-secret': 'secret',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_NOT_ACTIVE' },
    });
  });
});
