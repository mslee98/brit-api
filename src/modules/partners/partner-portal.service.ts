import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  buildPaginationMeta,
  type PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from './domain/enums/partner-exchange-type.enum';
import { PartnerFeeAccrualStatus } from './domain/enums/partner-fee-accrual-status.enum';
import { PartnerMemberRole } from './domain/enums/partner-member-role.enum';
import {
  PartnerExchangeResponseDto,
  PartnerFeeAccrualResponseDto,
  PartnerPortalDashboardResponseDto,
  PartnerPortalMeResponseDto,
} from './dto/partner-portal-response.dto';
import { PartnerFeePolicyResponseDto } from './dto/partner-fee-policy-response.dto';
import { SearchPartnerExchangesDto } from './dto/search-partner-exchanges.dto';
import { SearchPartnerFeeAccrualsDto } from './dto/search-partner-fee-accruals.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';

@Injectable()
export class PartnerPortalService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    @InjectRepository(PartnerExchangeEntity)
    private readonly exchangeRepository: Repository<PartnerExchangeEntity>,
    @InjectRepository(PartnerFeeAccrualEntity)
    private readonly accrualRepository: Repository<PartnerFeeAccrualEntity>,
    @InjectRepository(PartnerFeePolicyEntity)
    private readonly feePolicyRepository: Repository<PartnerFeePolicyEntity>,
    private readonly partnerFeePoliciesService: PartnerFeePoliciesService,
  ) {}

  async getMe(
    partnerId: string,
    memberId: string,
    memberRole: PartnerMemberRole,
  ): Promise<PartnerPortalMeResponseDto> {
    const partner = await this.requirePartner(partnerId);
    return PartnerPortalMeResponseDto.from(partner, memberId, memberRole);
  }

  async getDashboard(
    partnerId: string,
  ): Promise<PartnerPortalDashboardResponseDto> {
    const partner = await this.requirePartner(partnerId);
    const { start, end } = utcDayBounds(new Date());

    const [
      todayFeeRaw,
      cumulativeFeeRaw,
      accruedFeeRaw,
      todayCharge,
      todayRedeem,
      activePolicy,
    ] = await Promise.all([
      this.sumFees(partnerId, {
        statuses: [
          PartnerFeeAccrualStatus.ACCRUED,
          PartnerFeeAccrualStatus.SETTLED,
        ],
        from: start,
        to: end,
      }),
      this.sumFees(partnerId, {
        statuses: [
          PartnerFeeAccrualStatus.ACCRUED,
          PartnerFeeAccrualStatus.SETTLED,
        ],
      }),
      this.sumFees(partnerId, {
        statuses: [PartnerFeeAccrualStatus.ACCRUED],
      }),
      this.sumCompletedExchanges(
        partnerId,
        PartnerExchangeType.CHARGE,
        start,
        end,
      ),
      this.sumCompletedExchanges(
        partnerId,
        PartnerExchangeType.REDEEM,
        start,
        end,
      ),
      this.findActiveFeePolicy(partnerId),
    ]);

    const dto = new PartnerPortalDashboardResponseDto();
    dto.partnerId = partner.id;
    dto.partnerCode = partner.code;
    dto.partnerName = partner.name;
    dto.partnerStatus = partner.status;
    dto.todayFeeAmount = todayFeeRaw;
    dto.cumulativeFeeAmount = cumulativeFeeRaw;
    dto.accruedFeeAmount = accruedFeeRaw;
    dto.todayChargeCount = todayCharge.count;
    dto.todayRedeemCount = todayRedeem.count;
    dto.todayChargeAmount = todayCharge.amount;
    dto.todayRedeemAmount = todayRedeem.amount;
    dto.activeFeePolicyId = activePolicy?.id ?? null;
    dto.activeFeeRateBps = activePolicy?.feeRateBps ?? null;
    return dto;
  }

  async listFeePolicies(
    partnerId: string,
  ): Promise<PartnerFeePolicyResponseDto[]> {
    await this.requirePartner(partnerId);
    const rows = await this.feePolicyRepository.find({
      where: { partnerId },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => PartnerFeePolicyResponseDto.from(row));
  }

  async listFeeAccruals(
    partnerId: string,
    query: SearchPartnerFeeAccrualsDto,
  ): Promise<{
    items: PartnerFeeAccrualResponseDto[];
    pagination: PaginationMeta;
  }> {
    await this.requirePartner(partnerId);
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const qb = this.accrualRepository
      .createQueryBuilder('accrual')
      .leftJoinAndSelect('accrual.partnerExchange', 'exchange')
      .where('accrual.partnerId = :partnerId', { partnerId });

    if (query.exchangeType) {
      qb.andWhere('accrual.exchangeType = :exchangeType', {
        exchangeType: query.exchangeType,
      });
    }
    if (query.status) {
      qb.andWhere('accrual.status = :status', { status: query.status });
    }
    if (query.from) {
      qb.andWhere('accrual.accruedAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('accrual.accruedAt < :to', { to: new Date(query.to) });
    }

    qb.orderBy('accrual.accruedAt', 'DESC').addOrderBy('accrual.id', 'DESC');

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      items: rows.map((row) =>
        PartnerFeeAccrualResponseDto.from(
          row,
          row.partnerExchange?.exchangeNumber ?? null,
        ),
      ),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async listExchanges(
    partnerId: string,
    query: SearchPartnerExchangesDto,
  ): Promise<{
    items: PartnerExchangeResponseDto[];
    pagination: PaginationMeta;
  }> {
    await this.requirePartner(partnerId);
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    const qb = this.exchangeRepository
      .createQueryBuilder('exchange')
      .where('exchange.partnerId = :partnerId', { partnerId });

    if (query.exchangeType) {
      qb.andWhere('exchange.exchangeType = :exchangeType', {
        exchangeType: query.exchangeType,
      });
    }
    if (query.status) {
      qb.andWhere('exchange.status = :status', { status: query.status });
    }
    if (query.from) {
      qb.andWhere('exchange.requestedAt >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('exchange.requestedAt < :to', { to: new Date(query.to) });
    }

    qb.orderBy('exchange.requestedAt', 'DESC').addOrderBy('exchange.id', 'DESC');

    const [rows, totalItems] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      items: rows.map((row) => PartnerExchangeResponseDto.from(row)),
      pagination: buildPaginationMeta(page, size, totalItems),
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

  private async findActiveFeePolicy(
    partnerId: string,
  ): Promise<PartnerFeePolicyEntity | null> {
    return this.partnerFeePoliciesService.findApplicableActivePolicy(partnerId);
  }

  private async sumFees(
    partnerId: string,
    options: {
      statuses: PartnerFeeAccrualStatus[];
      from?: Date;
      to?: Date;
    },
  ): Promise<string> {
    const qb = this.accrualRepository
      .createQueryBuilder('accrual')
      .select('COALESCE(SUM(accrual.total_fee_amount), 0)', 'total')
      .where('accrual.partner_id = :partnerId', { partnerId })
      .andWhere('accrual.status IN (:...statuses)', {
        statuses: options.statuses,
      });

    if (options.from) {
      qb.andWhere('accrual.accrued_at >= :from', { from: options.from });
    }
    if (options.to) {
      qb.andWhere('accrual.accrued_at < :to', { to: options.to });
    }

    const raw = await qb.getRawOne<{ total: string }>();
    return raw?.total ?? '0';
  }

  private async sumCompletedExchanges(
    partnerId: string,
    exchangeType: PartnerExchangeType,
    from: Date,
    to: Date,
  ): Promise<{ count: number; amount: string }> {
    const raw = await this.exchangeRepository
      .createQueryBuilder('exchange')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(exchange.amount), 0)', 'amount')
      .where('exchange.partner_id = :partnerId', { partnerId })
      .andWhere('exchange.exchange_type = :exchangeType', { exchangeType })
      .andWhere('exchange.status = :status', {
        status: PartnerExchangeStatus.COMPLETED,
      })
      .andWhere('exchange.completed_at >= :from', { from })
      .andWhere('exchange.completed_at < :to', { to })
      .getRawOne<{ count: string; amount: string }>();

    return {
      count: Number(raw?.count ?? 0),
      amount: raw?.amount ?? '0',
    };
  }
}

function utcDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
