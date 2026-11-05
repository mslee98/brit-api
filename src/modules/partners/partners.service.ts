import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { PartnerResponseDto } from './dto/partner-response.dto';
import { SearchAdminPartnersDto } from './dto/search-admin-partners.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerEntity } from './infrastructure/entities/partner.entity';

/**
 * 업체(partners) 등록·수정·상태 전이.
 * 담당자는 PartnerMembersService.
 */
@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async searchAdmin(query: SearchAdminPartnersDto): Promise<{
    items: PartnerResponseDto[];
    pagination: PaginationMeta;
  }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.partnerRepository.createQueryBuilder('partner');

    if (query.keyword?.trim()) {
      const like = `%${query.keyword.trim()}%`;
      qb.andWhere(
        `(
          partner.code ILIKE :like
          OR partner.name ILIKE :like
          OR partner.contactName ILIKE :like
          OR partner.contactPhone ILIKE :like
          OR partner.contactEmail ILIKE :like
          OR partner.contactTelegram ILIKE :like
        )`,
        { like },
      );
    }
    if (query.status) {
      qb.andWhere('partner.status = :status', { status: query.status });
    }

    qb.orderBy('partner.createdAt', 'DESC').addOrderBy('partner.code', 'ASC');

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      items: rows.map((row) => PartnerResponseDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async findAdminDetail(partnerId: string): Promise<PartnerResponseDto> {
    const partner = await this.requirePartner(partnerId);
    return PartnerResponseDto.from(partner);
  }

  async createPartner(
    actorUserId: string,
    dto: CreatePartnerDto,
    ipAddress: string | null,
  ): Promise<PartnerResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(PartnerEntity);
        const saved = await repository.save(
          repository.create({
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            status: PartnerStatus.ACTIVE,
            contactName: dto.contactName.trim(),
            contactPhone: dto.contactPhone.trim(),
            contactEmail: dto.contactEmail.trim().toLowerCase(),
            contactTelegram: dto.contactTelegram?.trim() || null,
            memo: dto.memo?.trim() || null,
          }),
        );

        await this.auditLogService.writeInTransaction(manager, {
          actorUserId,
          actionType: AuditActionType.CREATE_PARTNER,
          targetType: AuditTargetType.PARTNER,
          targetId: saved.id,
          beforeData: null,
          afterData: {
            id: saved.id,
            code: saved.code,
            name: saved.name,
            status: saved.status,
          },
          reason: dto.reason?.trim() || null,
          ipAddress,
        });

        return PartnerResponseDto.from(saved);
      });
    } catch (error) {
      this.rethrowDuplicateCode(error);
      throw error;
    }
  }

  async updatePartner(
    actorUserId: string,
    partnerId: string,
    dto: UpdatePartnerDto,
    ipAddress: string | null,
  ): Promise<PartnerResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PartnerEntity);
      const partner = await repository.findOne({ where: { id: partnerId } });
      if (!partner) {
        throw PartnerDomainException.notFound();
      }

      const before = {
        name: partner.name,
        contactName: partner.contactName,
        contactPhone: partner.contactPhone,
        contactEmail: partner.contactEmail,
        contactTelegram: partner.contactTelegram,
        memo: partner.memo,
      };

      if (dto.name !== undefined) partner.name = dto.name.trim();
      if (dto.contactName !== undefined) {
        partner.contactName = dto.contactName.trim();
      }
      if (dto.contactPhone !== undefined) {
        partner.contactPhone = dto.contactPhone.trim();
      }
      if (dto.contactEmail !== undefined) {
        partner.contactEmail = dto.contactEmail.trim().toLowerCase();
      }
      if (dto.contactTelegram !== undefined) {
        partner.contactTelegram = dto.contactTelegram?.trim() || null;
      }
      if (dto.memo !== undefined) {
        partner.memo = dto.memo?.trim() || null;
      }

      const saved = await repository.save(partner);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.UPDATE_PARTNER,
        targetType: AuditTargetType.PARTNER,
        targetId: saved.id,
        beforeData: before,
        afterData: {
          name: saved.name,
          contactName: saved.contactName,
          contactPhone: saved.contactPhone,
          contactEmail: saved.contactEmail,
          contactTelegram: saved.contactTelegram,
          memo: saved.memo,
        },
        reason: dto.reason,
        ipAddress,
      });

      return PartnerResponseDto.from(saved);
    });
  }

  async suspendPartner(
    actorUserId: string,
    partnerId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.changePartnerStatus(
      actorUserId,
      partnerId,
      PartnerStatus.SUSPENDED,
      AuditActionType.SUSPEND_PARTNER,
      reason,
      ipAddress,
      [PartnerStatus.ACTIVE],
    );
  }

  async resumePartner(
    actorUserId: string,
    partnerId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.changePartnerStatus(
      actorUserId,
      partnerId,
      PartnerStatus.ACTIVE,
      AuditActionType.RESUME_PARTNER,
      reason,
      ipAddress,
      [PartnerStatus.SUSPENDED],
    );
  }

  async terminatePartner(
    actorUserId: string,
    partnerId: string,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.changePartnerStatus(
      actorUserId,
      partnerId,
      PartnerStatus.TERMINATED,
      AuditActionType.TERMINATE_PARTNER,
      reason,
      ipAddress,
      [PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED],
    );
  }

  private async changePartnerStatus(
    actorUserId: string,
    partnerId: string,
    nextStatus: PartnerStatus,
    actionType: AuditActionType,
    reason: string,
    ipAddress: string | null,
    allowedFrom: PartnerStatus[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PartnerEntity);
      const partner = await repository.findOne({ where: { id: partnerId } });
      if (!partner) {
        throw PartnerDomainException.notFound();
      }
      if (!allowedFrom.includes(partner.status)) {
        throw PartnerDomainException.invalidStatusTransition();
      }
      if (partner.status === nextStatus) {
        throw PartnerDomainException.invalidStatusTransition();
      }

      const beforeStatus = partner.status;
      partner.status = nextStatus;
      await repository.save(partner);

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType,
        targetType: AuditTargetType.PARTNER,
        targetId: partner.id,
        beforeData: { status: beforeStatus },
        afterData: { status: nextStatus },
        reason,
        ipAddress,
      });
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

  private rethrowDuplicateCode(error: unknown): void {
    if (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    ) {
      throw PartnerDomainException.codeDuplicate();
    }
  }
}
