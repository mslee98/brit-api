import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { CoinService } from '../coins/coin.service';
import { PartnerLinkSessionStatus } from './domain/enums/partner-link-session-status.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { UserPartnerLinkStatus } from './domain/enums/user-partner-link-status.enum';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerClientOriginEntity } from './infrastructure/entities/partner-client-origin.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerLinkSessionEntity } from './infrastructure/entities/partner-link-session.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { NotificationService } from '../notifications/notification.service';
import { LinkSessionStreamService } from './link-session-stream.service';
import { PartnerLinkSessionsService } from './partner-link-sessions.service';
import { DataSource } from 'typeorm';

type Row = { id?: string } & Record<string, unknown>;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function memoryRepo<T extends Row>(store: Map<string, T>) {
  return {
    create: (data: Partial<T>) => ({ ...data }) as T,
    save: async (entity: T) => {
      if (!entity.id) entity.id = `id-${Math.random().toString(36).slice(2, 10)}`;
      store.set(entity.id, entity);
      return entity;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      Array.from(store.values()).find((row) => matches(row, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) =>
      Array.from(store.values()).filter((row) => matches(row, where)),
    update: async (where: Record<string, unknown>, patch: Partial<T>) => {
      let affected = 0;
      for (const row of store.values()) {
        if (matches(row, where)) {
          Object.assign(row, patch);
          affected += 1;
        }
      }
      return { affected };
    },
    createQueryBuilder: () => {
      const state: {
        patch: Partial<T>;
        id?: string;
        status?: string;
        requireClaimedNull?: boolean;
      } = { patch: {} };
      const qb = {
        update: () => qb,
        set: (patch: Partial<T>) => {
          state.patch = patch;
          return qb;
        },
        where: (_sql: string, params: { id: string }) => {
          state.id = params.id;
          return qb;
        },
        andWhere: (sql: string, params?: { status?: string }) => {
          if (sql.includes('claimed_user_id IS NULL')) {
            state.requireClaimedNull = true;
          }
          if (params?.status) state.status = params.status;
          return qb;
        },
        execute: async () => {
          let affected = 0;
          for (const row of store.values()) {
            if (state.id && row.id !== state.id) continue;
            if (state.status && row.status !== state.status) continue;
            if (state.requireClaimedNull && row.claimedUserId != null) continue;
            Object.assign(row, state.patch);
            affected += 1;
          }
          return { affected };
        },
      };
      return qb;
    },
  };
}

describe('PartnerLinkSessionsService', () => {
  const partnerId = 'partner-1';
  const clientId = 'client-1';
  const userId = 'user-1';
  const origin = 'http://localhost:5176';

  let service: PartnerLinkSessionsService;
  let sessions: Map<string, PartnerLinkSessionEntity & Row>;
  let links: Map<string, UserPartnerLinkEntity & Row>;
  let partners: Map<string, PartnerEntity & Row>;

  beforeEach(async () => {
    sessions = new Map();
    links = new Map();
    partners = new Map();
    partners.set(partnerId, {
      id: partnerId,
      code: 'CUREBET',
      name: '큐어벳',
      status: PartnerStatus.ACTIVE,
    } as PartnerEntity & Row);
    partners.set('partner-2', {
      id: 'partner-2',
      code: 'OTHER',
      name: '다른샵',
      status: PartnerStatus.ACTIVE,
    } as PartnerEntity & Row);

    const origins = new Map<string, PartnerClientOriginEntity & Row>([
      [
        'o1',
        { id: 'o1', partnerClientId: clientId, origin: `${origin}/` } as PartnerClientOriginEntity & Row,
      ],
    ]);

    const linkRepo = memoryRepo(links);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerLinkSessionsService,
        PartnerExchangeService,
        { provide: getRepositoryToken(PartnerLinkSessionEntity), useValue: memoryRepo(sessions) },
        { provide: getRepositoryToken(PartnerClientOriginEntity), useValue: memoryRepo(origins) },
        { provide: getRepositoryToken(PartnerEntity), useValue: memoryRepo(partners) },
        { provide: getRepositoryToken(UserPartnerLinkEntity), useValue: linkRepo },
        { provide: getRepositoryToken(PartnerAssetEntity), useValue: {} },
        { provide: getRepositoryToken(PartnerExchangeEntity), useValue: {} },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockImplementation(async (id: string) => ({
              id,
              status: UserStatus.ACTIVE,
            })),
          },
        },
        { provide: CoinService, useValue: {} },
        { provide: PartnerCoinService, useValue: {} },
        { provide: PartnerFeePoliciesService, useValue: {} },
        { provide: DataSource, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: () => 'http://localhost:5173/' },
        },
        {
          provide: LinkSessionStreamService,
          useValue: { publish: jest.fn(), subscribe: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: { createInAppEvent: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(PartnerLinkSessionsService);
  });

  async function create(partnerUserKey = 'kim1') {
    return service.createSession(partnerId, clientId, {
      partnerUserKey,
      partnerUserLabel: '김*수',
      returnOrigin: origin,
    });
  }

  function plainCode(sessionId: string): string {
    return sessions.get(sessionId)!.pairingCodePlain!;
  }

  /** MC-P9: claim → 클라이언트 승인 → wait code */
  async function completeNew(
    created: Awaited<ReturnType<typeof create>>,
    uid = userId,
  ) {
    const code = plainCode(created.sessionId);
    await service.claim(created.sessionToken, uid);
    await service.approveByClient(uid, { pairingCode: code });
    const waited = await service.waitForResult(created.sessionToken, uid);
    return { code: waited.code!, returnOrigin: waited.returnOrigin };
  }

  it('세션 생성 → claim → 클라이언트 승인 → code 교환으로 연결이 확정된다', async () => {
    const created = await create();
    expect(created.linkUrl).toBe(
      `http://localhost:5173/embed.html#session=${created.sessionToken}`,
    );
    expect(created).not.toHaveProperty('pairingCode');
    const stored = sessions.get(created.sessionId)!;
    expect(stored.sessionTokenHash).not.toBe(created.sessionToken);
    expect(stored.pairingCodePlain).toMatch(/^\d{4}$/);
    expect(stored.pairingCodeHash).not.toBe(stored.pairingCodePlain);

    const view = await service.getForUser(created.sessionToken, userId);
    expect(view).toMatchObject({
      partnerName: '큐어벳',
      partnerUserKeyMasked: 'k**1',
      linkState: 'NEW',
      requiresPairing: true,
      returnOrigin: origin,
      pairingCode: null,
    });

    const { code, returnOrigin } = await completeNew(created);
    expect(returnOrigin).toBe(origin);
    expect(links.size).toBe(1);
    expect(sessions.get(created.sessionId)!.pairingVerifiedAt).toBeTruthy();

    const exchanged = await service.exchange(partnerId, code);
    expect(exchanged).toMatchObject({
      partnerUserKey: 'kim1',
      status: UserPartnerLinkStatus.ACTIVE,
    });
    expect(sessions.get(created.sessionId)!.status).toBe(
      PartnerLinkSessionStatus.EXCHANGED,
    );
  });

  it('NEW 연결은 Embed consent로 승인할 수 없다', async () => {
    const created = await create();
    await expect(
      service.consent(created.sessionToken, userId),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_CLIENT_APPROVAL_REQUIRED' },
    });
  });

  it('틀린 연결 코드는 거절하고 시도 횟수가 늘어난다', async () => {
    const created = await create();
    await service.claim(created.sessionToken, userId);
    const wrong = plainCode(created.sessionId) === '0000' ? '0001' : '0000';
    await expect(
      service.approveByClient(userId, { pairingCode: wrong }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_PAIRING_CODE_INVALID' },
    });
    expect(sessions.get(created.sessionId)!.pairingAttemptCount).toBe(1);
  });

  it('연결 코드 시도 5회 초과 시 세션이 만료된다', async () => {
    const created = await create();
    await service.claim(created.sessionToken, userId);
    const wrong = plainCode(created.sessionId) === '0000' ? '0001' : '0000';
    for (let i = 0; i < 4; i += 1) {
      await expect(
        service.approveByClient(userId, { pairingCode: wrong }),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_LINK_PAIRING_CODE_INVALID' },
      });
    }
    await expect(
      service.approveByClient(userId, { pairingCode: wrong }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_PAIRING_ATTEMPTS_EXCEEDED' },
    });
    expect(sessions.get(created.sessionId)!.status).toBe(
      PartnerLinkSessionStatus.EXPIRED,
    );
  });

  it('code는 한 번만 교환할 수 있다', async () => {
    const created = await create();
    const { code } = await completeNew(created);
    await service.exchange(partnerId, code);
    await expect(service.exchange(partnerId, code)).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_CODE_INVALID' },
    });
  });

  it('다른 업체는 code를 교환할 수 없다', async () => {
    const created = await create();
    const { code } = await completeNew(created);
    await expect(service.exchange('partner-2', code)).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_CODE_INVALID' },
    });
  });

  it('만료된 code는 교환할 수 없다', async () => {
    const created = await create();
    const { code } = await completeNew(created);
    sessions.get(created.sessionId)!.codeExpiresAt = new Date(Date.now() - 1);
    await expect(service.exchange(partnerId, code)).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_CODE_INVALID' },
    });
  });

  it('등록되지 않은 returnOrigin은 거절한다', async () => {
    await expect(
      service.createSession(partnerId, clientId, {
        partnerUserKey: 'kim1',
        returnOrigin: 'https://evil.example.com',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_ORIGIN_NOT_ALLOWED' },
    });
  });

  it('만료된 세션은 EXPIRED로 바뀌고 거절된다', async () => {
    const created = await create();
    sessions.get(created.sessionId)!.expiresAt = new Date(Date.now() - 1);
    await expect(
      service.getForUser(created.sessionToken, userId),
    ).rejects.toMatchObject({ response: { code: 'PARTNER_LINK_SESSION_EXPIRED' } });
    expect(sessions.get(created.sessionId)!.status).toBe(
      PartnerLinkSessionStatus.EXPIRED,
    );
  });

  it('거절하면 세션은 다시 쓸 수 없고 연결도 생기지 않는다', async () => {
    const created = await create();
    await service.claim(created.sessionToken, userId);
    await service.reject(created.sessionToken, userId);
    expect(links.size).toBe(0);
    await expect(completeNew(created)).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_SESSION_ALREADY_USED' },
    });
  });

  it('Embed 거절·wait는 claim된 본인만 가능하다', async () => {
    const created = await create();
    await expect(
      service.reject(created.sessionToken, userId),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_SESSION_NOT_CLAIMED' },
    });
    await expect(
      service.waitForResult(created.sessionToken, userId),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_SESSION_NOT_CLAIMED' },
    });

    await service.claim(created.sessionToken, userId);
    await expect(
      service.reject(created.sessionToken, 'user-2'),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_SESSION_CLAIMED_BY_OTHER' },
    });
    await expect(
      service.waitForResult(created.sessionToken, 'user-2'),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_SESSION_CLAIMED_BY_OTHER' },
    });
  });

  it('재방문: 이미 같은 연결이면 ALREADY_LINKED_SAME이고 OTP 없이 기존 연결을 쓴다', async () => {
    const first = await create();
    const { code } = await completeNew(first);
    const firstLink = await service.exchange(partnerId, code);

    const second = await create();
    const view = await service.getForUser(second.sessionToken, userId);
    expect(view).toMatchObject({
      linkState: 'ALREADY_LINKED_SAME',
      requiresPairing: false,
    });
    const again = await service.consent(second.sessionToken, userId);
    const secondLink = await service.exchange(partnerId, again.code);
    expect(secondLink.linkId).toBe(firstLink.linkId);
    expect(links.size).toBe(1);
  });

  it('POL-LINK-001: 같은 업체 다른 회원 키로 연결된 사용자는 CONFLICT_OTHER_KEY이고 동의가 거절된다', async () => {
    const first = await create('kim1');
    await completeNew(first);

    const second = await create('kim2');
    const view = await service.getForUser(second.sessionToken, userId);
    expect(view.linkState).toBe('CONFLICT_OTHER_KEY');
    await expect(
      service.consent(second.sessionToken, userId),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_USER_ALREADY_LINKED' },
    });
    expect(sessions.get(second.sessionId)!.status).toBe(
      PartnerLinkSessionStatus.PENDING,
    );
  });

  it('POL-LINK-001: 다른 BRIT 회원에 연결된 회원 키는 CONFLICT_KEY_TAKEN이다', async () => {
    const first = await create('kim1');
    await completeNew(first, 'user-2');

    const second = await create('kim1');
    const view = await service.getForUser(second.sessionToken, userId);
    expect(view.linkState).toBe('CONFLICT_KEY_TAKEN');
    await expect(
      service.consent(second.sessionToken, userId),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_USER_LINK_ALREADY_EXISTS' },
    });
  });

  it('MC-P9: claim 후에만 코드가 보이고, 클라이언트 승인 후 wait로 code를 받는다', async () => {
    const created = await create();
    const before = await service.getForUser(created.sessionToken, userId);
    expect(before.claimed).toBe(false);
    expect(before.pairingCode).toBeNull();

    const claimed = await service.claim(created.sessionToken, userId);
    expect(claimed.claimed).toBe(true);
    expect(claimed.pairingCode).toBe(plainCode(created.sessionId));

    await expect(
      service.claim(created.sessionToken, 'user-2'),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_SESSION_CLAIMED_BY_OTHER' },
    });

    const preview = await service.previewApprovalByCode(
      userId,
      plainCode(created.sessionId),
    );
    expect(preview).toMatchObject({
      sessionId: created.sessionId,
      partnerName: '큐어벳',
      linkState: 'NEW',
    });

    await service.approveByClient(userId, {
      pairingCode: plainCode(created.sessionId),
    });
    expect(sessions.get(created.sessionId)!.status).toBe(
      PartnerLinkSessionStatus.CONSENTED,
    );

    const waited = await service.waitForResult(created.sessionToken, userId);
    expect(waited.status).toBe('CONSENTED');
    expect(waited.code).toBeTruthy();

    const exchanged = await service.exchange(partnerId, waited.code!);
    expect(exchanged.partnerUserKey).toBe('kim1');
  });

  it('MC-P9: claim되지 않은 코드는 전역으로 승인할 수 없다', async () => {
    const created = await create();
    await expect(
      service.approveByClient(userId, {
        pairingCode: plainCode(created.sessionId),
      }),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_LINK_PAIRING_CODE_INVALID' },
    });
  });
});
