import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { AuditLogService } from '../admins/audit-log.service';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { PartnerMemberStatus } from './domain/enums/partner-member-status.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { AssignPartnerMemberDto } from './dto/assign-partner-member.dto';
import { PartnerMemberResponseDto } from './dto/partner-response.dto';
import { UpdatePartnerMemberDto } from './dto/update-partner-member.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerMemberEntity } from './infrastructure/entities/partner-member.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';

/**
 * 업체 담당자(partner_members) 연결·역할·해제.
 */
@Injectable()
export class PartnerMembersService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    @InjectRepository(PartnerMemberEntity)
    private readonly memberRepository: Repository<PartnerMemberEntity>,
    private readonly userService: UserService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async listMembers(partnerId: string): Promise<PartnerMemberResponseDto[]> {
    await this.requirePartner(partnerId);

    const members = await this.memberRepository.find({
      where: { partnerId },
      relations: { user: { profile: true } },
      order: { createdAt: 'DESC' },
    });

    return members.map((member) => PartnerMemberResponseDto.from(member));
  }

  async assignMember(
    actorUserId: string,
    partnerId: string,
    dto: AssignPartnerMemberDto,
    ipAddress: string | null,
  ): Promise<PartnerMemberResponseDto> {
    const userSummary = await this.requireActiveMemberUser(dto.userId);

    return this.dataSource.transaction(async (manager) => {
      const partnerRepo = manager.getRepository(PartnerEntity);
      const memberRepo = manager.getRepository(PartnerMemberEntity);

      const partner = await partnerRepo.findOne({ where: { id: partnerId } });
      if (!partner) {
        throw PartnerDomainException.notFound();
      }
      if (partner.status === PartnerStatus.TERMINATED) {
        throw PartnerDomainException.terminated();
      }

      const existingActive = await memberRepo.findOne({
        where: {
          userId: dto.userId,
          status: PartnerMemberStatus.ACTIVE,
        },
      });
      if (existingActive) {
        if (existingActive.partnerId === partnerId) {
          throw PartnerDomainException.memberAlreadyOnPartner();
        }
        throw PartnerDomainException.memberAlreadyAssigned();
      }

      const now = new Date();
      const saved = await memberRepo.save(
        memberRepo.create({
          partnerId,
          userId: dto.userId,
          role: dto.role,
          status: PartnerMemberStatus.ACTIVE,
          invitedByUserId: actorUserId,
          joinedAt: now,
          removedAt: null,
        }),
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.ASSIGN_PARTNER_MEMBER,
        targetType: AuditTargetType.PARTNER_MEMBER,
        targetId: saved.id,
        beforeData: null,
        afterData: {
          partnerId,
          userId: dto.userId,
          role: dto.role,
          status: PartnerMemberStatus.ACTIVE,
        },
        reason: dto.reason?.trim() || null,
        ipAddress,
      });

      return PartnerMemberResponseDto.from(saved, userSummary);
    });
  }

  async reassignMember(
    actorUserId: string,
    partnerId: string,
    dto: AssignPartnerMemberDto,
    ipAddress: string | null,
  ): Promise<PartnerMemberResponseDto> {
    const userSummary = await this.requireActiveMemberUser(dto.userId);

    return this.dataSource.transaction(async (manager) => {
      const partnerRepo = manager.getRepository(PartnerEntity);
      const memberRepo = manager.getRepository(PartnerMemberEntity);

      const partner = await partnerRepo.findOne({ where: { id: partnerId } });
      if (!partner) {
        throw PartnerDomainException.notFound();
      }
      if (partner.status === PartnerStatus.TERMINATED) {
        throw PartnerDomainException.terminated();
      }

      const existingActive = await memberRepo.findOne({
        where: {
          userId: dto.userId,
          status: PartnerMemberStatus.ACTIVE,
        },
      });
      if (!existingActive) {
        throw PartnerDomainException.memberNotAssigned();
      }
      if (existingActive.partnerId === partnerId) {
        throw PartnerDomainException.memberAlreadyOnPartner();
      }

      const now = new Date();
      const before = {
        partnerId: existingActive.partnerId,
        userId: existingActive.userId,
        role: existingActive.role,
        memberId: existingActive.id,
      };

      existingActive.status = PartnerMemberStatus.REMOVED;
      existingActive.removedAt = now;
      await memberRepo.save(existingActive);

      const saved = await memberRepo.save(
        memberRepo.create({
          partnerId,
          userId: dto.userId,
          role: dto.role,
          status: PartnerMemberStatus.ACTIVE,
          invitedByUserId: actorUserId,
          joinedAt: now,
          removedAt: null,
        }),
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.REASSIGN_PARTNER_MEMBER,
        targetType: AuditTargetType.PARTNER_MEMBER,
        targetId: saved.id,
        beforeData: before,
        afterData: {
          partnerId,
          userId: dto.userId,
          role: dto.role,
          status: PartnerMemberStatus.ACTIVE,
          previousMemberId: existingActive.id,
        },
        reason: dto.reason?.trim() || null,
        ipAddress,
      });

      return PartnerMemberResponseDto.from(saved, userSummary);
    });
  }

  async updateMemberRole(
    actorUserId: string,
    partnerId: string,
    memberId: string,
    dto: UpdatePartnerMemberDto,
    ipAddress: string | null,
  ): Promise<PartnerMemberResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.requirePartnerInManager(
        manager.getRepository(PartnerEntity),
        partnerId,
      );

      const memberRepo = manager.getRepository(PartnerMemberEntity);
      const member = await memberRepo.findOne({
        where: { id: memberId, partnerId },
        relations: { user: { profile: true } },
      });
      if (!member || member.status !== PartnerMemberStatus.ACTIVE) {
        throw PartnerDomainException.memberNotFound();
      }

      const beforeRole = member.role;
      member.role = dto.role;
      const saved = await memberRepo.save(member);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.CHANGE_PARTNER_MEMBER_ROLE,
        targetType: AuditTargetType.PARTNER_MEMBER,
        targetId: saved.id,
        beforeData: { role: beforeRole },
        afterData: { role: saved.role },
        reason: dto.reason,
        ipAddress,
      });

      return PartnerMemberResponseDto.from(saved);
    });
  }

  async removeMember(
    actorUserId: string,
    partnerId: string,
    memberId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.requirePartnerInManager(
        manager.getRepository(PartnerEntity),
        partnerId,
      );

      const memberRepo = manager.getRepository(PartnerMemberEntity);
      const member = await memberRepo.findOne({
        where: { id: memberId, partnerId },
      });
      if (!member || member.status !== PartnerMemberStatus.ACTIVE) {
        throw PartnerDomainException.memberNotFound();
      }

      member.status = PartnerMemberStatus.REMOVED;
      member.removedAt = new Date();
      await memberRepo.save(member);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.REMOVE_PARTNER_MEMBER,
        targetType: AuditTargetType.PARTNER_MEMBER,
        targetId: member.id,
        beforeData: {
          partnerId,
          userId: member.userId,
          role: member.role,
          status: PartnerMemberStatus.ACTIVE,
        },
        afterData: {
          status: PartnerMemberStatus.REMOVED,
          removedAt: member.removedAt.toISOString(),
        },
        reason,
        ipAddress,
      });
    });
  }

  private async requireActiveMemberUser(userId: string): Promise<{
    loginId: string;
    nickname: string | null;
    realName: string | null;
  }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw PartnerDomainException.userNotFound();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw PartnerDomainException.memberUserNotActive();
    }
    const [nickname, realName] = await Promise.all([
      this.userService.getNicknameByUserId(userId),
      this.userService.getNameByUserId(userId),
    ]);
    return {
      loginId: user.loginId,
      nickname,
      realName,
    };
  }

  private async requirePartner(partnerId: string): Promise<PartnerEntity> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    return partner;
  }

  private async requirePartnerInManager(
    repository: Repository<PartnerEntity>,
    partnerId: string,
  ): Promise<PartnerEntity> {
    const partner = await repository.findOne({ where: { id: partnerId } });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    return partner;
  }
}
