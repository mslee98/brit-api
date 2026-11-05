import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { PartnerMemberRole } from './domain/enums/partner-member-role.enum';
import { PartnerMemberStatus } from './domain/enums/partner-member-status.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { PartnerMemberEntity } from './infrastructure/entities/partner-member.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { PartnerMembersService } from './partner-members.service';

describe('PartnerMembersService', () => {
  let service: PartnerMembersService;
  let partnerRepository: { findOne: jest.Mock };
  let memberRepository: { find: jest.Mock; findOne: jest.Mock };
  let partnerRepo: { findOne: jest.Mock };
  let memberRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let userService: {
    findById: jest.Mock;
    getNicknameByUserId: jest.Mock;
    getNameByUserId: jest.Mock;
  };
  let auditLogService: { writeInTransaction: jest.Mock };

  const actorUserId = 'admin-1';
  const partnerId = 'partner-1';
  const userId = 'user-1';
  const now = new Date('2026-11-05T02:00:00.000Z');

  const runTransaction = async <T>(
    work: (manager: {
      getRepository: (entity: unknown) => unknown;
    }) => Promise<T>,
  ): Promise<T> => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === PartnerEntity) return partnerRepo;
        if (entity === PartnerMemberEntity) return memberRepo;
        throw new Error(`unexpected repository: ${String(entity)}`);
      },
    };
    return work(manager);
  };

  beforeEach(async () => {
    partnerRepo = { findOne: jest.fn() };
    memberRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (row) => ({
        ...row,
        id: row.id ?? 'member-1',
        createdAt: row.createdAt ?? now,
        updatedAt: row.updatedAt ?? now,
      })),
    };
    partnerRepository = { findOne: jest.fn() };
    memberRepository = { find: jest.fn(), findOne: jest.fn() };
    userService = {
      findById: jest.fn().mockResolvedValue({
        id: userId,
        loginId: 'shopowner',
        status: UserStatus.ACTIVE,
      }),
      getNicknameByUserId: jest.fn().mockResolvedValue('닉'),
      getNameByUserId: jest.fn().mockResolvedValue('실명'),
    };
    auditLogService = {
      writeInTransaction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerMembersService,
        {
          provide: DataSource,
          useValue: { transaction: jest.fn(runTransaction) },
        },
        {
          provide: getRepositoryToken(PartnerEntity),
          useValue: partnerRepository,
        },
        {
          provide: getRepositoryToken(PartnerMemberEntity),
          useValue: memberRepository,
        },
        { provide: UserService, useValue: userService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(PartnerMembersService);
  });

  describe('assignMember', () => {
    it('ACTIVE 업체에 OWNER를 연결하고 감사를 남긴다', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: partnerId,
        status: PartnerStatus.ACTIVE,
      });
      memberRepo.findOne.mockResolvedValue(null);

      const result = await service.assignMember(
        actorUserId,
        partnerId,
        {
          userId,
          role: PartnerMemberRole.OWNER,
          reason: '온보딩',
        },
        '127.0.0.1',
      );

      expect(result.role).toBe(PartnerMemberRole.OWNER);
      expect(result.loginId).toBe('shopowner');
      expect(memberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerId,
          userId,
          role: PartnerMemberRole.OWNER,
          status: PartnerMemberStatus.ACTIVE,
        }),
      );
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.ASSIGN_PARTNER_MEMBER,
          reason: '온보딩',
        }),
      );
    });

    it('타 업체 ACTIVE 소속이면 PARTNER_MEMBER_ALREADY_ASSIGNED', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: partnerId,
        status: PartnerStatus.ACTIVE,
      });
      memberRepo.findOne.mockResolvedValue({
        id: 'other-member',
        partnerId: 'partner-other',
        userId,
        status: PartnerMemberStatus.ACTIVE,
      });

      await expect(
        service.assignMember(
          actorUserId,
          partnerId,
          {
            userId,
            role: PartnerMemberRole.MANAGER,
            reason: '중복',
          },
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.assignMember(
          actorUserId,
          partnerId,
          {
            userId,
            role: PartnerMemberRole.MANAGER,
            reason: '중복',
          },
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_MEMBER_ALREADY_ASSIGNED' },
      });
    });

    it('TERMINATED 업체면 PARTNER_TERMINATED', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: partnerId,
        status: PartnerStatus.TERMINATED,
      });

      await expect(
        service.assignMember(
          actorUserId,
          partnerId,
          {
            userId,
            role: PartnerMemberRole.OWNER,
            reason: '종료 후',
          },
          null,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.assignMember(
          actorUserId,
          partnerId,
          {
            userId,
            role: PartnerMemberRole.OWNER,
            reason: '종료 후',
          },
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_TERMINATED' },
      });
    });

    it('사용자가 ACTIVE가 아니면 PARTNER_MEMBER_USER_NOT_ACTIVE', async () => {
      userService.findById.mockResolvedValue({
        id: userId,
        loginId: 'pending',
        status: UserStatus.PENDING,
      });

      await expect(
        service.assignMember(
          actorUserId,
          partnerId,
          {
            userId,
            role: PartnerMemberRole.OWNER,
            reason: '미승인',
          },
          null,
        ),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_MEMBER_USER_NOT_ACTIVE' },
      });
      expect(partnerRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('ACTIVE 멤버를 REMOVED로 바꾼다', async () => {
      partnerRepo.findOne.mockResolvedValue({
        id: partnerId,
        status: PartnerStatus.ACTIVE,
      });
      memberRepo.findOne.mockResolvedValue({
        id: 'member-1',
        partnerId,
        userId,
        role: PartnerMemberRole.MANAGER,
        status: PartnerMemberStatus.ACTIVE,
        removedAt: null,
      });

      await service.removeMember(
        actorUserId,
        partnerId,
        'member-1',
        '퇴사',
        null,
      );

      expect(memberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PartnerMemberStatus.REMOVED,
          removedAt: expect.any(Date),
        }),
      );
      expect(auditLogService.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actionType: AuditActionType.REMOVE_PARTNER_MEMBER,
          reason: '퇴사',
        }),
      );
    });
  });
});
