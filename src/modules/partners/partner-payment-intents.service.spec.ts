import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CoinService } from '../coins/coin.service';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { PartnerPaymentIntentStatus } from './domain/enums/partner-payment-intent-status.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { UserPartnerLinkStatus } from './domain/enums/user-partner-link-status.enum';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerClientOriginEntity } from './infrastructure/entities/partner-client-origin.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { PartnerPaymentIntentsService } from './partner-payment-intents.service';
import { FeeRoundingRule } from './domain/enums/fee-rounding-rule.enum';

type Row = { id?: string } & Record<string, unknown>;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function memoryRepo(store: Map<string, Row>) {
  return {
    create: (data: Partial<Row>) => ({ ...data }) as Row,
    save: async (entity: Row) => {
      if (!entity.id) entity.id = `id-${Math.random().toString(36).slice(2, 10)}`;
      store.set(entity.id, { ...entity });
      return store.get(entity.id)!;
    },
    findOne: async ({
      where,
      order,
    }: {
      where: Record<string, unknown>;
      order?: Record<string, 'ASC' | 'DESC'>;
    }) => {
      let rows = Array.from(store.values()).filter((row) => matches(row, where));
      if (order?.createdAt === 'ASC') {
        rows = rows.sort(
          (a, b) =>
            new Date(String(a.createdAt ?? 0)).getTime() -
            new Date(String(b.createdAt ?? 0)).getTime(),
        );
      }
      return rows[0] ?? null;
    },
    find: async ({ where }: { where: Record<string, unknown> }) =>
      Array.from(store.values()).filter((row) => matches(row, where)),
  };
}

describe('PartnerPaymentIntentsService', () => {
  const partnerId = 'partner-1';
  const clientId = 'client-1';
  const userId = 'user-1';
  const origin = 'http://localhost:5176';

  let service: PartnerPaymentIntentsService;
  let intents: Map<string, Row>;
  let links: Map<string, Row>;
  let chargeMock: jest.Mock;
  let verifyPinMock: jest.Mock;

  beforeEach(async () => {
    intents = new Map();
    links = new Map();
    const partners = new Map<string, Row>([
      [
        partnerId,
        {
          id: partnerId,
          name: '샘플 샵',
          code: 'SAMPLE',
          status: PartnerStatus.ACTIVE,
        },
      ],
    ]);
    const origins = new Map<string, Row>([
      [
        'o1',
        {
          id: 'o1',
          partnerClientId: clientId,
          origin,
        },
      ],
    ]);
    const assets = new Map<string, Row>([
      [
        'a1',
        {
          id: 'a1',
          partnerId,
          assetCode: 'POINT',
          isActive: true,
          createdAt: new Date(),
        },
      ],
    ]);

    chargeMock = jest.fn().mockResolvedValue({
      id: 'ex-1',
      exchangeNumber: 'CH-1',
      status: 'COMPLETED',
    });
    verifyPinMock = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerPaymentIntentsService,
        {
          provide: getRepositoryToken(PartnerPaymentIntentEntity),
          useValue: memoryRepo(intents),
        },
        {
          provide: getRepositoryToken(PartnerClientOriginEntity),
          useValue: memoryRepo(origins),
        },
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: memoryRepo(partners),
        },
        {
          provide: getRepositoryToken(PartnerAssetEntity),
          useValue: memoryRepo(assets),
        },
        {
          provide: getRepositoryToken(UserPartnerLinkEntity),
          useValue: memoryRepo(links),
        },
        {
          provide: PartnerExchangeService,
          useValue: { charge: chargeMock },
        },
        {
          provide: PartnerFeePoliciesService,
          useValue: {
            findApplicableActivePolicy: jest.fn().mockResolvedValue({
              feeRateBps: 0,
              fixedFeeAmount: '0',
              roundingRule: FeeRoundingRule.FLOOR,
            }),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: userId,
              status: UserStatus.ACTIVE,
            }),
            verifyTransactionPin: verifyPinMock,
          },
        },
        {
          provide: CoinService,
          useValue: {
            getWallet: jest.fn().mockResolvedValue({
              nonSellableBalance: '100000',
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'BRIT_EMBED_BASE_URL' ? 'http://localhost:5173' : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(PartnerPaymentIntentsService);

    links.set('link-1', {
      id: 'link-1',
      partnerId,
      partnerUserKey: 'A-123',
      userId,
      status: UserPartnerLinkStatus.ACTIVE,
    });
  });

  it('creates intent with payUrl and idempotent externalOrderId', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-001',
      partnerUserKey: 'A-123',
      amount: '50000',
      returnOrigin: origin,
      assetCode: 'POINT',
    });

    expect(created.status).toBe(PartnerPaymentIntentStatus.CREATED);
    expect(created.payUrl).toContain('/embed-pay.html#intent=');
    expect(created.chargeAmountMs).toBe('50000');

    const again = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-001',
      partnerUserKey: 'A-123',
      amount: '50000',
      returnOrigin: origin,
      assetCode: 'POINT',
    });
    expect(again.intentId).toBe(created.intentId);
  });

  it('authorizes with PIN then charges', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-002',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });

    const result = await service.authorize(created.intentId, userId, {
      pin: '123456',
    });

    expect(verifyPinMock).toHaveBeenCalledWith(userId, '123456');
    expect(chargeMock).toHaveBeenCalledWith(
      partnerId,
      clientId,
      expect.objectContaining({
        idempotencyKey: `intent:${created.intentId}`,
        partnerUserKey: 'A-123',
        amount: '10000',
      }),
    );
    expect(result.status).toBe(PartnerPaymentIntentStatus.COMPLETED);
    expect(result.partnerExchangeId).toBe('ex-1');
  });

  it('rejects authorize when linked to another user', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-003',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });

    await expect(
      service.authorize(created.intentId, 'other-user', { pin: '123456' }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_USER_MISMATCH' },
    });
    expect(chargeMock).not.toHaveBeenCalled();
  });
});
