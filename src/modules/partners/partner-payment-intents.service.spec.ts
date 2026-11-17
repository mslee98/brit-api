import { BadRequestException } from '@nestjs/common';
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
    createQueryBuilder: () => {
      const state: {
        setData?: Record<string, unknown>;
        id?: string;
        requireNullAmount?: boolean;
      } = {};
      const qb = {
        update: () => qb,
        set: (data: Record<string, unknown>) => {
          state.setData = data;
          return qb;
        },
        where: (_sql: string, params: { id: string }) => {
          state.id = params.id;
          return qb;
        },
        andWhere: (sql: string) => {
          if (sql.includes('amount IS NULL') || sql.includes('amount_locked_at')) {
            state.requireNullAmount = true;
          }
          return qb;
        },
        execute: async () => {
          const row = state.id ? store.get(state.id) : undefined;
          if (!row || !state.setData) return { affected: 0 };
          if (
            state.requireNullAmount &&
            (row.amount != null || row.amountLockedAt != null)
          ) {
            return { affected: 0 };
          }
          Object.assign(row, state.setData);
          store.set(String(row.id), row);
          return { affected: 1 };
        },
      };
      return qb;
    },
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
  let beginChargeLockMock: jest.Mock;
  let verifyPinMock: jest.Mock;
  let getWalletMock: jest.Mock;

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

    beginChargeLockMock = jest.fn().mockResolvedValue({
      id: 'ex-1',
      exchangeNumber: 'CH-1',
      status: 'ASSET_LOCKED',
    });
    verifyPinMock = jest.fn().mockResolvedValue(undefined);
    getWalletMock = jest.fn().mockResolvedValue({
      nonSellableBalance: '100000',
    });

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
          useValue: { beginChargeLock: beginChargeLockMock },
        },
        {
          provide: PartnerFeePoliciesService,
          useValue: {
            findApplicableActivePolicy: jest.fn().mockResolvedValue({
              id: 'fee-1',
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
            getWallet: getWalletMock,
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

  it('authorizes with PIN then locks (B4-1)', async () => {
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
    expect(beginChargeLockMock).toHaveBeenCalledWith(
      partnerId,
      clientId,
      expect.objectContaining({
        idempotencyKey: `intent:${created.intentId}`,
        partnerUserKey: 'A-123',
        amount: '10000',
      }),
    );
    expect(result.status).toBe(PartnerPaymentIntentStatus.PAYMENT_PROCESSING);
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
    expect(beginChargeLockMock).not.toHaveBeenCalled();
  });

  it('marks intent FAILED when beginChargeLock throws', async () => {
    beginChargeLockMock.mockRejectedValueOnce(
      new BadRequestException({
        code: 'COIN_BALANCE_INSUFFICIENT',
        message: '잔액이 부족해요.',
      }),
    );

    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-fail',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });

    await expect(
      service.authorize(created.intentId, userId, { pin: '123456' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const row = intents.get(created.intentId)!;
    expect(row.status).toBe(PartnerPaymentIntentStatus.FAILED);
    expect(row.failureCode).toBe('COIN_BALANCE_INSUFFICIENT');
  });

  it('returns PAYMENT_PROCESSING again without locking twice', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-idem',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });

    await service.authorize(created.intentId, userId, { pin: '123456' });
    beginChargeLockMock.mockClear();

    const again = await service.authorize(created.intentId, userId, {
      pin: '123456',
    });
    expect(again.status).toBe(PartnerPaymentIntentStatus.PAYMENT_PROCESSING);
    expect(beginChargeLockMock).not.toHaveBeenCalled();
  });

  it('cancels CREATED intent and blocks later authorize', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-cancel',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });

    const cancelled = await service.cancel(created.intentId, userId);
    expect(cancelled.status).toBe(PartnerPaymentIntentStatus.CANCELLED);

    await expect(
      service.authorize(created.intentId, userId, { pin: '123456' }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_NOT_AUTHORIZABLE' },
    });
  });

  it('expires CREATED intent and reports canAuthorize false', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-expire',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });
    const row = intents.get(created.intentId)!;
    row.expiresAt = new Date(Date.now() - 1000);

    const view = await service.getForEmbed(created.intentId, userId);
    expect(view.status).toBe(PartnerPaymentIntentStatus.EXPIRED);
    expect(view.canAuthorize).toBe(false);

    await expect(
      service.authorize(created.intentId, userId, { pin: '123456' }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_EXPIRED' },
    });
  });

  it('blocks authorize in embed view when nonSellable balance is too low', async () => {
    getWalletMock.mockResolvedValueOnce({ nonSellableBalance: '100' });
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-lowbal',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });

    const view = await service.getForEmbed(created.intentId, userId);
    expect(view.canAuthorize).toBe(false);
    expect(view.blockReason).toContain('잔액이 부족');
  });

  it('rejects cancel on expired intent with EXPIRED code', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-expire-cancel',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });
    intents.get(created.intentId)!.expiresAt = new Date(Date.now() - 1000);

    await expect(service.cancel(created.intentId, userId)).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_EXPIRED' },
    });
  });

  it('does not expire PAYMENT_PROCESSING even after expiresAt', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-processing-expire',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });
    await service.authorize(created.intentId, userId, { pin: '123456' });
    const row = intents.get(created.intentId)!;
    expect(row.status).toBe(PartnerPaymentIntentStatus.PAYMENT_PROCESSING);
    row.expiresAt = new Date(Date.now() - 1000);

    const view = await service.getForEmbed(created.intentId, userId);
    expect(view.status).toBe(PartnerPaymentIntentStatus.PAYMENT_PROCESSING);
    expect(view.canAuthorize).toBe(false);

    const again = await service.authorize(created.intentId, userId, {
      pin: '123456',
    });
    expect(again.status).toBe(PartnerPaymentIntentStatus.PAYMENT_PROCESSING);
  });

  it('rejects cancel on PAYMENT_PROCESSING', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-processing-cancel',
      partnerUserKey: 'A-123',
      amount: '10000',
      returnOrigin: origin,
    });
    await service.authorize(created.intentId, userId, { pin: '123456' });

    await expect(
      service.cancel(created.intentId, userId),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_NOT_AUTHORIZABLE' },
    });
  });

  it('creates draft intent without amount (D26)', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-draft',
      partnerUserKey: 'A-123',
      returnOrigin: origin,
      assetCode: 'POINT',
    });

    expect(created.chargeAmountMs).toBeNull();
    expect(created.feeAmountMs).toBeNull();
    expect(created.totalDebitMs).toBeNull();

    const view = await service.getForEmbed(created.intentId, userId);
    expect(view.needsAmount).toBe(true);
    expect(view.canAuthorize).toBe(false);
    expect(view.nonSellableBalanceMs).toBe('100000');
    expect(view.blockReason).toBeNull();
  });

  it('locks amount then allows authorize (D26)', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-lock',
      partnerUserKey: 'A-123',
      returnOrigin: origin,
    });

    await expect(
      service.authorize(created.intentId, userId, { pin: '123456' }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_AMOUNT_REQUIRED' },
    });

    const locked = await service.lockAmount(created.intentId, userId, {
      amount: '27500',
    });
    expect(locked.needsAmount).toBe(false);
    expect(locked.chargeAmountMs).toBe('27500');
    expect(locked.canAuthorize).toBe(true);

    const result = await service.authorize(created.intentId, userId, {
      pin: '123456',
    });
    expect(result.status).toBe(PartnerPaymentIntentStatus.PAYMENT_PROCESSING);
    expect(beginChargeLockMock).toHaveBeenCalledWith(
      partnerId,
      clientId,
      expect.objectContaining({ amount: '27500' }),
    );
  });

  it('lock rejects insufficient balance and conflicting amount', async () => {
    const created = await service.create(partnerId, clientId, {
      externalOrderId: 'shop-order-lock-conflict',
      partnerUserKey: 'A-123',
      returnOrigin: origin,
    });

    await expect(
      service.lockAmount(created.intentId, userId, { amount: '500000' }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_INSUFFICIENT_BALANCE' },
    });

    await service.lockAmount(created.intentId, userId, { amount: '50000' });
    const again = await service.lockAmount(created.intentId, userId, {
      amount: '50000',
    });
    expect(again.chargeAmountMs).toBe('50000');

    await expect(
      service.lockAmount(created.intentId, userId, { amount: '60000' }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PAYMENT_INTENT_AMOUNT_LOCKED' },
    });
  });
});
