import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { AuditActionType } from './domain/enums/audit-action-type.enum';
import { AuditTargetType } from './domain/enums/audit-target-type.enum';
import {
  AuditLogDetailDto,
  AuditLogListItemDto,
  AuditLogListResponseDto,
} from './dto/audit-log-response.dto';
import { SearchAuditLogsDto } from './dto/search-audit-logs.dto';
import { AdminDomainException } from './exceptions/admin.exceptions';
import { AuditLogEntity } from './infrastructure/entities/audit-log.entity';
import { parseCoinAdjustmentSummary } from './utils/audit-coin-adjustment.util';

export type WriteAuditLogInput = {
  actorUserId: string | null;
  actionType: AuditActionType | string;
  targetType: string;
  targetId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  reason: string | null;
  ipAddress: string | null;
};

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async writeInTransaction(
    manager: EntityManager,
    input: WriteAuditLogInput,
  ): Promise<AuditLogEntity> {
    const repository = manager.getRepository(AuditLogEntity);
    const log = repository.create({
      actorUserId: input.actorUserId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeData: input.beforeData,
      afterData: input.afterData,
      reason: input.reason,
      ipAddress: input.ipAddress,
    });
    return repository.save(log);
  }

  async write(input: WriteAuditLogInput): Promise<AuditLogEntity> {
    const log = this.auditLogRepository.create({
      actorUserId: input.actorUserId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeData: input.beforeData,
      afterData: input.afterData,
      reason: input.reason,
      ipAddress: input.ipAddress,
    });
    return this.auditLogRepository.save(log);
  }

  async search(query: SearchAuditLogsDto): Promise<AuditLogListResponseDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const qb = this.auditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.actorUser', 'actor')
      .leftJoinAndSelect('actor.profile', 'actorProfile')
      .orderBy('log.createdAt', 'DESC');

    this.applySearchFilters(qb, query);

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const targetUserMap = await this.loadTargetUserMap(rows);

    return {
      items: rows.map((row) =>
        this.toListItem(row, targetUserMap.get(row.targetId ?? '') ?? null),
      ),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getDetail(auditLogId: string): Promise<AuditLogDetailDto> {
    const row = await this.auditLogRepository.findOne({
      where: { id: auditLogId },
      relations: { actorUser: { profile: true } },
    });
    if (!row) {
      throw AdminDomainException.auditLogNotFound();
    }

    const targetUser =
      row.targetType === AuditTargetType.USER && row.targetId
        ? ((await this.loadTargetUserMap([row])).get(row.targetId) ?? null)
        : null;

    return {
      ...this.toListItem(row, targetUser),
      beforeData: row.beforeData,
      afterData: row.afterData,
    };
  }

  private applySearchFilters(
    qb: ReturnType<Repository<AuditLogEntity>['createQueryBuilder']>,
    query: SearchAuditLogsDto,
  ): void {
    if (query.actorUserId) {
      qb.andWhere('log.actorUserId = :actorUserId', {
        actorUserId: query.actorUserId,
      });
    }

    const actionTypes = this.resolveActionTypes(query);
    if (actionTypes.length === 1) {
      qb.andWhere('log.actionType = :actionType', {
        actionType: actionTypes[0],
      });
    } else if (actionTypes.length > 1) {
      qb.andWhere('log.actionType IN (:...actionTypes)', { actionTypes });
    }

    if (query.targetType) {
      qb.andWhere('log.targetType = :targetType', {
        targetType: query.targetType,
      });
    }
    if (query.targetId) {
      qb.andWhere('log.targetId = :targetId', {
        targetId: query.targetId,
      });
    }
    if (query.createdFrom) {
      qb.andWhere('log.createdAt >= :createdFrom', {
        createdFrom: new Date(query.createdFrom),
      });
    }
    if (query.createdTo) {
      qb.andWhere('log.createdAt <= :createdTo', {
        createdTo: new Date(query.createdTo),
      });
    }
  }

  private resolveActionTypes(query: SearchAuditLogsDto): AuditActionType[] {
    if (query.actionTypes && query.actionTypes.length > 0) {
      return query.actionTypes;
    }
    if (query.actionType) {
      return [query.actionType];
    }
    return [];
  }

  private async loadTargetUserMap(
    rows: AuditLogEntity[],
  ): Promise<Map<string, UserEntity>> {
    const targetUserIds = [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.targetType === AuditTargetType.USER && row.targetId != null,
          )
          .map((row) => row.targetId as string),
      ),
    ];

    if (targetUserIds.length === 0) {
      return new Map();
    }

    const users = await this.userRepository.find({
      where: { id: In(targetUserIds) },
      relations: { profile: true },
    });

    return new Map(users.map((user) => [user.id, user]));
  }

  private toListItem(
    row: AuditLogEntity,
    targetUser: UserEntity | null,
  ): AuditLogListItemDto {
    return {
      id: row.id,
      actor: {
        userId: row.actorUserId,
        loginId: row.actorUser?.loginId ?? null,
        name: row.actorUser?.profile?.name ?? null,
      },
      actionType: row.actionType,
      targetType: row.targetType,
      targetId: row.targetId,
      target: targetUser
        ? {
            userId: targetUser.id,
            loginId: targetUser.loginId,
            name: targetUser.profile?.name ?? '',
          }
        : null,
      coinAdjustment: parseCoinAdjustmentSummary(
        row.actionType,
        row.afterData,
      ),
      reason: row.reason,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
    };
  }
}
