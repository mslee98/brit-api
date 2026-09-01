import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { AdminAccessService } from '../admins/admin-access.service';
import { AuditLogEntity } from '../admins/infrastructure/entities/audit-log.entity';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AdminDomainException } from '../admins/exceptions/admin.exceptions';
import {
  CreateMatchingPolicyDto,
  MatchingPolicyResponseDto,
  SearchMatchingPoliciesDto,
} from './dto/matching-policy.dto';
import { OrderDomainException } from './exceptions/order.exceptions';
import { MatchingPolicyEntity } from './infrastructure/entities/matching-policy.entity';

@Injectable()
export class MatchingPolicyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly adminAccessService: AdminAccessService,
    @InjectRepository(MatchingPolicyEntity)
    private readonly matchingPolicyRepository: Repository<MatchingPolicyEntity>,
  ) {}

  async getActivePolicy(): Promise<MatchingPolicyResponseDto> {
    const policy = await this.matchingPolicyRepository.findOne({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC' },
    });
    if (!policy) {
      throw OrderDomainException.matchingPolicyNotFound();
    }
    return MatchingPolicyResponseDto.from(policy);
  }

  async listPolicyHistory(
    actor: AuthenticatedUser,
    query: SearchMatchingPoliciesDto,
  ): Promise<{ items: MatchingPolicyResponseDto[]; pagination: PaginationMeta }> {
    await this.adminAccessService.assertIsLeaderOrSysAdmin(actor);

    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const [rows, totalItems] = await this.matchingPolicyRepository.findAndCount({
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    return {
      items: rows.map((row) => MatchingPolicyResponseDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async createPolicyVersion(
    actorUserId: string,
    actorRole: UserRole,
    dto: CreateMatchingPolicyDto,
    ipAddress: string | null,
  ): Promise<MatchingPolicyResponseDto> {
    if (actorRole !== UserRole.SYS_ADMIN) {
      throw AdminDomainException.forbidden();
    }

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MatchingPolicyEntity);
      const activeRows = await repository.find({
        where: { isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      for (const row of activeRows) {
        row.isActive = false;
        await repository.save(row);
      }

      const created = await repository.save(
        repository.create({
          minSplitRatioBps: dto.minSplitRatioBps,
          buyerPaymentTimeoutSeconds: dto.buyerPaymentTimeoutSeconds,
          sellerConfirmationTimeoutSeconds: dto.sellerConfirmationTimeoutSeconds,
          maxRematchCount: dto.maxRematchCount,
          nearMatchMaxRatioBps: dto.nearMatchMaxRatioBps,
          isActive: true,
          effectiveFrom: new Date(dto.effectiveFrom),
          createdByUserId: actorUserId,
          reason: dto.reason,
        }),
      );

      await manager.getRepository(AuditLogEntity).save(
        manager.getRepository(AuditLogEntity).create({
          actorUserId,
          actionType: AuditActionType.CREATE_MATCHING_POLICY,
          targetType: AuditTargetType.MATCHING_POLICY,
          targetId: created.id,
          beforeData: null,
          afterData: {
            id: created.id,
            minSplitRatioBps: created.minSplitRatioBps,
            buyerPaymentTimeoutSeconds: created.buyerPaymentTimeoutSeconds,
            sellerConfirmationTimeoutSeconds:
              created.sellerConfirmationTimeoutSeconds,
            maxRematchCount: created.maxRematchCount,
            nearMatchMaxRatioBps: created.nearMatchMaxRatioBps,
            effectiveFrom: created.effectiveFrom,
          },
          reason: dto.reason,
          ipAddress,
        }),
      );

      return MatchingPolicyResponseDto.from(created);
    });
  }
}
