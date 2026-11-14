import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AuditLogService } from '../admins/audit-log.service';
import { AuditActionType } from '../admins/domain/enums/audit-action-type.enum';
import { AuditTargetType } from '../admins/domain/enums/audit-target-type.enum';
import {
  PartnerWalletResponseDto,
  UpdatePartnerCreditLimitDto,
} from './dto/partner-wallet.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { PartnerCoinService } from './partner-coin.service';

/**
 * 관리자용 업체 Coin 지갑 조회·마이너스 한도 설정.
 */
@Injectable()
export class PartnerWalletsService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    private readonly partnerCoinService: PartnerCoinService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async getWallet(partnerId: string): Promise<PartnerWalletResponseDto> {
    await this.requirePartner(partnerId);
    const summary = await this.partnerCoinService.getWalletSummary(
      this.dataSource.manager,
      partnerId,
    );
    return PartnerWalletResponseDto.from(summary);
  }

  async updateCreditLimit(
    actorUserId: string,
    partnerId: string,
    dto: UpdatePartnerCreditLimitDto,
    ipAddress: string | null,
  ): Promise<PartnerWalletResponseDto> {
    await this.requirePartner(partnerId);
    return this.dataSource.transaction(async (manager) => {
      const before = await this.partnerCoinService.getWalletSummary(
        manager,
        partnerId,
      );
      const after = await this.partnerCoinService.updateCreditLimit(
        manager,
        partnerId,
        dto.creditLimit,
      );

      await this.auditLogService.writeInTransaction(manager, {
        actorUserId,
        actionType: AuditActionType.UPDATE_PARTNER_CREDIT_LIMIT,
        targetType: AuditTargetType.PARTNER,
        targetId: partnerId,
        beforeData: { creditLimit: before.creditLimit },
        afterData: {
          creditLimit: after.creditLimit,
          availableBalance: after.availableBalance,
        },
        reason: dto.reason?.trim() || null,
        ipAddress,
      });

      return PartnerWalletResponseDto.from(after);
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
