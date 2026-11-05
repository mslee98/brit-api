import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthClientType } from '../../auth/domain/enums/auth-client-type.enum';
import { UserRole } from '../../users/domain/enums/user-role.enum';
import { PartnerMemberRole } from '../domain/enums/partner-member-role.enum';
import { PartnerMemberStatus } from '../domain/enums/partner-member-status.enum';
import { PartnerStatus } from '../domain/enums/partner-status.enum';
import { PartnerMemberEntity } from '../infrastructure/entities/partner-member.entity';
import { PartnerEntity } from '../infrastructure/entities/partner.entity';
import { PartnerMemberGuard } from './partner-member.guard';

function mockContext(user?: {
  userId: string;
}): ExecutionContext {
  const request: Record<string, unknown> = {
    user: user
      ? {
          userId: user.userId,
          sessionId: 's1',
          role: UserRole.USER,
          tokenType: 'access',
          clientType: AuthClientType.USER,
        }
      : undefined,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('PartnerMemberGuard', () => {
  let guard: PartnerMemberGuard;
  let memberFindOne: jest.Mock;
  let partnerFindOne: jest.Mock;

  beforeEach(async () => {
    memberFindOne = jest.fn();
    partnerFindOne = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        PartnerMemberGuard,
        {
          provide: getRepositoryToken(PartnerMemberEntity),
          useValue: { findOne: memberFindOne },
        },
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: { findOne: partnerFindOne },
        },
      ],
    }).compile();
    guard = module.get(PartnerMemberGuard);
  });

  it('ACTIVE 멤버 + ACTIVE 업체면 partnerId를 주입한다', async () => {
    memberFindOne.mockResolvedValue({
      id: 'm1',
      partnerId: 'p1',
      role: PartnerMemberRole.OWNER,
      status: PartnerMemberStatus.ACTIVE,
    });
    partnerFindOne.mockResolvedValue({
      id: 'p1',
      status: PartnerStatus.ACTIVE,
    });

    const ctx = mockContext({ userId: 'u1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest() as {
      partnerId?: string;
      partnerMemberRole?: PartnerMemberRole;
    };
    expect(req.partnerId).toBe('p1');
    expect(req.partnerMemberRole).toBe(PartnerMemberRole.OWNER);
  });

  it('SUSPENDED 업체도 포털 조회를 허용한다', async () => {
    memberFindOne.mockResolvedValue({
      id: 'm1',
      partnerId: 'p1',
      role: PartnerMemberRole.MANAGER,
      status: PartnerMemberStatus.ACTIVE,
    });
    partnerFindOne.mockResolvedValue({
      id: 'p1',
      status: PartnerStatus.SUSPENDED,
    });
    await expect(
      guard.canActivate(mockContext({ userId: 'u1' })),
    ).resolves.toBe(true);
  });

  it('TERMINATED 업체는 거부한다', async () => {
    memberFindOne.mockResolvedValue({
      id: 'm1',
      partnerId: 'p1',
      role: PartnerMemberRole.OWNER,
      status: PartnerMemberStatus.ACTIVE,
    });
    partnerFindOne.mockResolvedValue({
      id: 'p1',
      status: PartnerStatus.TERMINATED,
    });
    await expect(
      guard.canActivate(mockContext({ userId: 'u1' })),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PORTAL_TERMINATED' },
    });
  });

  it('멤버십 없으면 거부한다', async () => {
    memberFindOne.mockResolvedValue(null);
    await expect(
      guard.canActivate(mockContext({ userId: 'u1' })),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_PORTAL_MEMBERSHIP_REQUIRED' },
    });
  });
});
