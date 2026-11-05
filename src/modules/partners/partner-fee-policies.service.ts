import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { FeeRoundingRule } from './domain/enums/fee-rounding-rule.enum';
import { FeeSettlementCycle } from './domain/enums/fee-settlement-cycle.enum';
import { PartnerFeeTarget } from './domain/enums/partner-fee-target.enum';
import { CreatePartnerFeePolicyDto } from './dto/create-partner-fee-policy.dto';
import { PartnerFeePolicyResponseDto } from './dto/partner-fee-policy-response.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import {
  feeTargetsForExchange,
  selectApplicableFeePolicy,
} from './utils/partner-fee-policy-select.util';

@Injectable()
export class PartnerFeePoliciesService {
  constructor(
    @InjectRepository(PartnerFeePolicyEntity)
    private readonly feePolicyRepository: Repository<PartnerFeePolicyEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async listForPartner(
    partnerId: string,
  ): Promise<PartnerFeePolicyResponseDto[]> {
    await this.requirePartner(partnerId);
    const rows = await this.feePolicyRepository.find({
      where: { partnerId },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => PartnerFeePolicyResponseDto.from(row));
  }

  /**
   * 현재 유효한 활성 정책 중 적용 대상 1건.
   * - preferredTarget: CHARGE/REDEEM 실행용 (exact → ALL)
   * - 미지정: 대시보드용 (ALL → 최신)
   */
  async findApplicableActivePolicy(
    partnerId: string,
    preferredTarget?: PartnerFeeTarget,
  ): Promise<PartnerFeePolicyEntity | null> {
    const now = new Date();
    const qb = this.feePolicyRepository
      .createQueryBuilder('policy')
      .where('policy.partnerId = :partnerId', { partnerId })
      .andWhere('policy.isActive = true')
      .andWhere('policy.effectiveFrom <= :now', { now })
      .andWhere('(policy.effectiveTo IS NULL OR policy.effectiveTo > :now)', {
        now,
      });

    if (preferredTarget) {
      qb.andWhere('policy.feeTarget IN (:...targets)', {
        targets: feeTargetsForExchange(preferredTarget),
      });
    }

    const policies = await qb
      .orderBy('policy.effectiveFrom', 'DESC')
      .addOrderBy('policy.createdAt', 'DESC')
      .getMany();

    return selectApplicableFeePolicy(policies, preferredTarget);
  }

  async create(
    actorUserId: string,
    partnerId: string,
    dto: CreatePartnerFeePolicyDto,
    ipAddress: string | null,
  ): Promise<PartnerFeePolicyResponseDto> {
    await this.requirePartner(partnerId);

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw PartnerDomainException.feePolicyInvalidPeriod();
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PartnerFeePolicyEntity);
      const saved = await repo.save(
        repo.create({
          partnerId,
          feeTarget: dto.feeTarget,
          feeRateBps: dto.feeRateBps,
          fixedFeeAmount: String(dto.fixedFeeAmount ?? 0),
          roundingRule: dto.roundingRule ?? FeeRoundingRule.FLOOR,
          settlementCycle: dto.settlementCycle ?? FeeSettlementCycle.WEEKLY,
          settlementWeekday: dto.settlementWeekday ?? null,
          paymentDueDays: dto.paymentDueDays ?? 3,
          effectiveFrom,
          effectiveTo,
          isActive: dto.isActive ?? true,
          createdByUserId: actorUserId,
        }),
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.CREATE_PARTNER_FEE_POLICY,
        targetType: AuditTargetType.PARTNER_FEE_POLICY,
        targetId: saved.id,
        beforeData: null,
        afterData: {
          partnerId,
          feeTarget: saved.feeTarget,
          feeRateBps: saved.feeRateBps,
          fixedFeeAmount: saved.fixedFeeAmount,
          effectiveFrom: saved.effectiveFrom.toISOString(),
          effectiveTo: saved.effectiveTo?.toISOString() ?? null,
          isActive: saved.isActive,
        },
        reason: dto.reason?.trim() || null,
        ipAddress,
      });

      return PartnerFeePolicyResponseDto.from(saved);
    });
  }

  async deactivate(
    actorUserId: string,
    partnerId: string,
    policyId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<PartnerFeePolicyResponseDto> {
    await this.requirePartner(partnerId);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PartnerFeePolicyEntity);
      const policy = await repo.findOne({
        where: { id: policyId, partnerId },
      });
      if (!policy) {
        throw PartnerDomainException.feePolicyNotFound();
      }
      if (!policy.isActive) {
        throw PartnerDomainException.feePolicyInactive();
      }

      const before = {
        isActive: policy.isActive,
        effectiveTo: policy.effectiveTo?.toISOString() ?? null,
      };

      policy.isActive = false;
      if (!policy.effectiveTo || policy.effectiveTo > new Date()) {
        policy.effectiveTo = new Date();
      }
      const saved = await repo.save(policy);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.DEACTIVATE_PARTNER_FEE_POLICY,
        targetType: AuditTargetType.PARTNER_FEE_POLICY,
        targetId: saved.id,
        beforeData: before,
        afterData: {
          isActive: saved.isActive,
          effectiveTo: saved.effectiveTo?.toISOString() ?? null,
        },
        reason,
        ipAddress,
      });

      return PartnerFeePolicyResponseDto.from(saved);
    });
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
}
