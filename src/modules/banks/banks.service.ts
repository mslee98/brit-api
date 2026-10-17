import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import { AdminDomainException } from '../admins/exceptions/admin.exceptions';
import { AdminProfileEntity } from '../admins/infrastructure/entities/admin-profile.entity';
import { AuditLogEntity } from '../admins/infrastructure/entities/audit-log.entity';
import { UserRole } from '../users/domain/enums/user-role.enum';
import {
  BankResponseDto,
  BanksListResponseDto,
  PublicBankResponseDto,
  publicBankIconUrl,
} from './dto/bank-response.dto';
import { CreateBankDto } from './dto/create-bank.dto';
import { SearchAdminBanksDto } from './dto/search-admin-banks.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { BankEntity } from './infrastructure/entities/bank.entity';

/** 은행 마스터 조회·관리. 가입·계좌 등록 시 bank_code 유효성 확인에 사용. */
@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(BankEntity)
    private readonly bankRepository: Repository<BankEntity>,
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private assetPublicBaseUrl(): string {
    return this.configService.get<string>('ASSET_PUBLIC_BASE_URL') ?? '';
  }

  async findActiveByCode(code: string): Promise<BankEntity | null> {
    return this.bankRepository.findOne({
      where: { code, isActive: true },
    });
  }

  /** 거래 스냅샷 표시용. 비활성 은행도 조회한다. */
  async findByCode(code: string): Promise<BankEntity | null> {
    return this.bankRepository.findOne({
      where: { code },
    });
  }

  /** 거래 입금 지시 등 표시용 — 이름·아이콘 URL */
  async resolveDisplayByCode(code: string): Promise<{
    code: string;
    name: string;
    iconUrl: string | null;
  }> {
    const bank = await this.findByCode(code);
    if (!bank) {
      return { code, name: code, iconUrl: null };
    }
    return {
      code: bank.code,
      name: bank.name,
      iconUrl: publicBankIconUrl(bank.svgFilename, this.assetPublicBaseUrl()),
    };
  }

  async listActiveBanks(): Promise<BanksListResponseDto> {
    const rows = await this.bankRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    const assetBaseUrl = this.assetPublicBaseUrl();

    return BanksListResponseDto.of(
      rows.map((row) => PublicBankResponseDto.from(row, assetBaseUrl)),
    );
  }

  async getActiveBankDetail(bankId: number): Promise<PublicBankResponseDto> {
    const bank = await this.bankRepository.findOne({
      where: { id: bankId, isActive: true },
    });
    if (!bank) {
      throw AdminDomainException.bankNotFound();
    }
    const assetBaseUrl = this.assetPublicBaseUrl();
    return PublicBankResponseDto.from(bank, assetBaseUrl);
  }

  async searchAdmin(
    actor: AuthenticatedUser,
    query: SearchAdminBanksDto,
  ): Promise<{
    items: BankResponseDto[];
    pagination: PaginationMeta;
  }> {
    await this.assertCanReadBanks(actor);

    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const qb = this.bankRepository.createQueryBuilder('bank');

    if (query.keyword) {
      qb.andWhere('(bank.code ILIKE :like OR bank.name ILIKE :like)', {
        like: `%${query.keyword}%`,
      });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('bank.isActive = :isActive', { isActive: query.isActive });
    }

    qb.orderBy('bank.sortOrder', 'ASC').addOrderBy('bank.name', 'ASC');

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const assetBaseUrl = this.assetPublicBaseUrl();

    return {
      items: rows.map((row) => BankResponseDto.from(row, assetBaseUrl)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async findAdminBankDetail(
    actor: AuthenticatedUser,
    bankId: number,
  ): Promise<BankResponseDto> {
    await this.assertCanReadBanks(actor);

    const bank = await this.bankRepository.findOne({ where: { id: bankId } });
    if (!bank) {
      throw AdminDomainException.bankNotFound();
    }
    const assetBaseUrl = this.assetPublicBaseUrl();
    return BankResponseDto.from(bank, assetBaseUrl);
  }

  async createBank(
    actorUserId: string,
    dto: CreateBankDto,
    ipAddress: string | null,
  ): Promise<BankResponseDto> {
    this.assertDailyMaintenancePair(
      dto.dailyMaintenanceStart,
      dto.dailyMaintenanceEnd,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(BankEntity);
        const bank = repository.create({
          code: dto.code,
          name: dto.name,
          iconKey: dto.iconKey ?? null,
          svgFilename: dto.svgFilename ?? null,
          dailyMaintenanceStart: dto.dailyMaintenanceStart ?? null,
          dailyMaintenanceEnd: dto.dailyMaintenanceEnd ?? null,
          regularMaintenanceRule: dto.regularMaintenanceRule ?? null,
          maintenanceNote: dto.maintenanceNote ?? null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: false,
        });
        const saved = await repository.save(bank);

        await manager.getRepository(AuditLogEntity).save(
          manager.getRepository(AuditLogEntity).create({
            actorUserId,
            actionType: AuditActionType.CREATE_BANK,
            targetType: AuditTargetType.BANK,
            targetId: String(saved.id),
            beforeData: null,
            afterData: {
              id: saved.id,
              code: saved.code,
              name: saved.name,
              isActive: saved.isActive,
            },
            reason: dto.reason,
            ipAddress,
          }),
        );

        const assetBaseUrl = this.assetPublicBaseUrl();
        return BankResponseDto.from(saved, assetBaseUrl);
      });
    } catch (error) {
      this.rethrowDuplicateBank(error);
      throw error;
    }
  }

  async updateBank(
    actorUserId: string,
    bankId: number,
    dto: UpdateBankDto,
    ipAddress: string | null,
  ): Promise<BankResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BankEntity);
      const bank = await repository.findOne({ where: { id: bankId } });
      if (!bank) {
        throw AdminDomainException.bankNotFound();
      }

      const nextStart =
        dto.dailyMaintenanceStart !== undefined
          ? dto.dailyMaintenanceStart
          : bank.dailyMaintenanceStart;
      const nextEnd =
        dto.dailyMaintenanceEnd !== undefined
          ? dto.dailyMaintenanceEnd
          : bank.dailyMaintenanceEnd;
      this.assertDailyMaintenancePair(nextStart, nextEnd);

      const before = {
        name: bank.name,
        iconKey: bank.iconKey,
        svgFilename: bank.svgFilename,
        dailyMaintenanceStart: bank.dailyMaintenanceStart,
        dailyMaintenanceEnd: bank.dailyMaintenanceEnd,
        regularMaintenanceRule: bank.regularMaintenanceRule,
        maintenanceNote: bank.maintenanceNote,
        sortOrder: bank.sortOrder,
      };

      if (dto.name !== undefined) bank.name = dto.name;
      if (dto.iconKey !== undefined) bank.iconKey = dto.iconKey;
      if (dto.svgFilename !== undefined) bank.svgFilename = dto.svgFilename;
      if (dto.dailyMaintenanceStart !== undefined) {
        bank.dailyMaintenanceStart = dto.dailyMaintenanceStart;
      }
      if (dto.dailyMaintenanceEnd !== undefined) {
        bank.dailyMaintenanceEnd = dto.dailyMaintenanceEnd;
      }
      if (dto.regularMaintenanceRule !== undefined) {
        bank.regularMaintenanceRule = dto.regularMaintenanceRule;
      }
      if (dto.maintenanceNote !== undefined) {
        bank.maintenanceNote = dto.maintenanceNote;
      }
      if (dto.sortOrder !== undefined) bank.sortOrder = dto.sortOrder;

      const saved = await repository.save(bank);

      await manager.getRepository(AuditLogEntity).save(
        manager.getRepository(AuditLogEntity).create({
          actorUserId,
          actionType: AuditActionType.UPDATE_BANK,
          targetType: AuditTargetType.BANK,
          targetId: String(saved.id),
          beforeData: before,
          afterData: {
            name: saved.name,
            iconKey: saved.iconKey,
            svgFilename: saved.svgFilename,
            dailyMaintenanceStart: saved.dailyMaintenanceStart,
            dailyMaintenanceEnd: saved.dailyMaintenanceEnd,
            regularMaintenanceRule: saved.regularMaintenanceRule,
            maintenanceNote: saved.maintenanceNote,
            sortOrder: saved.sortOrder,
          },
          reason: dto.reason,
          ipAddress,
        }),
      );

      const assetBaseUrl = this.assetPublicBaseUrl();
      return BankResponseDto.from(saved, assetBaseUrl);
    });
  }

  async setBankActive(
    actorUserId: string,
    bankId: number,
    isActive: boolean,
    reason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BankEntity);
      const bank = await repository.findOne({ where: { id: bankId } });
      if (!bank) {
        throw AdminDomainException.bankNotFound();
      }

      if (bank.isActive === isActive) {
        throw isActive
          ? AdminDomainException.bankAlreadyActive()
          : AdminDomainException.bankAlreadyInactive();
      }

      if (isActive && (!bank.iconKey || !bank.svgFilename)) {
        throw AdminDomainException.bankIconRequired();
      }

      const before = { isActive: bank.isActive };
      bank.isActive = isActive;
      await repository.save(bank);

      await manager.getRepository(AuditLogEntity).save(
        manager.getRepository(AuditLogEntity).create({
          actorUserId,
          actionType: isActive
            ? AuditActionType.ACTIVATE_BANK
            : AuditActionType.DEACTIVATE_BANK,
          targetType: AuditTargetType.BANK,
          targetId: String(bank.id),
          beforeData: before,
          afterData: { isActive },
          reason,
          ipAddress,
        }),
      );
    });
  }

  async assertCanReadBanks(actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYS_ADMIN) {
      return;
    }
    const profile = await this.adminProfileRepository.findOne({
      where: { userId: actor.userId },
    });
    if (!profile?.isLeader) {
      throw AdminDomainException.forbidden();
    }
  }

  private assertDailyMaintenancePair(
    start: string | null | undefined,
    end: string | null | undefined,
  ): void {
    const hasStart = start != null && start !== '';
    const hasEnd = end != null && end !== '';
    if (hasStart !== hasEnd) {
      throw AdminDomainException.invalidMaintenanceTime();
    }
  }

  private rethrowDuplicateBank(error: unknown): void {
    if (!(error instanceof QueryFailedError)) {
      return;
    }
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    if (driverError.code !== '23505') {
      return;
    }
    if ((driverError.constraint ?? '').includes('banks_code')) {
      throw AdminDomainException.duplicateBankCode();
    }
  }
}
