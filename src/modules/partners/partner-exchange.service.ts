import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { CoinLedgerEntryType } from '../coins/domain/enums/coin-ledger-entry-type.enum';
import { CoinSourceType } from '../coins/domain/enums/coin-source-type.enum';
import { CoinService } from '../coins/coin.service';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { PartnerCoinLedgerEntryType } from './domain/enums/partner-coin-ledger-entry-type.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from './domain/enums/partner-exchange-type.enum';
import { PartnerFeeAccrualStatus } from './domain/enums/partner-fee-accrual-status.enum';
import { PartnerFeeTarget } from './domain/enums/partner-fee-target.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { UserPartnerLinkStatus } from './domain/enums/user-partner-link-status.enum';
import {
  CreatePartnerAssetDto,
  CreateUserPartnerLinkDto,
  PartnerExchangeRequestDto,
} from './dto/partner-exchange-request.dto';
import { PartnerExchangeResponseDto } from './dto/partner-portal-response.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { calculateTotalFee } from './utils/partner-fee.util';

const EXCHANGE_REF = 'PARTNER_EXCHANGE';

@Injectable()
export class PartnerExchangeService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    @InjectRepository(PartnerAssetEntity)
    private readonly assetRepository: Repository<PartnerAssetEntity>,
    @InjectRepository(PartnerExchangeEntity)
    private readonly exchangeRepository: Repository<PartnerExchangeEntity>,
    @InjectRepository(UserPartnerLinkEntity)
    private readonly linkRepository: Repository<UserPartnerLinkEntity>,
    private readonly userService: UserService,
    private readonly coinService: CoinService,
    private readonly partnerCoinService: PartnerCoinService,
    private readonly partnerFeePoliciesService: PartnerFeePoliciesService,
    private readonly dataSource: DataSource,
  ) {}

  async createAsset(
    partnerId: string,
    dto: CreatePartnerAssetDto,
  ): Promise<PartnerAssetEntity> {
    await this.requireActivePartner(partnerId);
    const existing = await this.assetRepository.findOne({
      where: { partnerId, assetCode: dto.assetCode.trim().toUpperCase() },
    });
    if (existing) {
      return existing;
    }
    return this.assetRepository.save(
      this.assetRepository.create({
        partnerId,
        assetCode: dto.assetCode.trim().toUpperCase(),
        assetName: dto.assetName.trim(),
        assetType: dto.assetType?.trim() || 'POINT',
        exchangeRateNumerator: '1',
        exchangeRateDenominator: '1',
        isActive: true,
      }),
    );
  }

  async linkUser(
    partnerId: string,
    dto: CreateUserPartnerLinkDto,
  ): Promise<UserPartnerLinkEntity> {
    await this.requireActivePartner(partnerId);
    const user = await this.userService.findById(dto.userId);
    if (!user) {
      throw PartnerDomainException.userNotFound();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw PartnerDomainException.userNotActiveForLink();
    }

    const key = dto.partnerUserKey.trim();
    const byKey = await this.linkRepository.findOne({
      where: { partnerId, partnerUserKey: key },
    });
    if (byKey && byKey.status === UserPartnerLinkStatus.ACTIVE) {
      if (byKey.userId === dto.userId) {
        return byKey;
      }
      throw PartnerDomainException.linkAlreadyExists();
    }

    const activeForUser = await this.linkRepository.findOne({
      where: {
        partnerId,
        userId: dto.userId,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    if (activeForUser) {
      return activeForUser;
    }

    return this.linkRepository.save(
      this.linkRepository.create({
        partnerId,
        userId: dto.userId,
        partnerUserKey: key,
        status: UserPartnerLinkStatus.ACTIVE,
        linkedAt: new Date(),
      }),
    );
  }

  /**
   * Sandbox 동기 CHARGE: 사용자 MS 차감 + 업체 잔액 증가 + 수수료 스냅샷.
   */
  async charge(
    partnerId: string,
    partnerClientId: string | null,
    dto: PartnerExchangeRequestDto,
  ): Promise<PartnerExchangeResponseDto> {
    return this.executeExchange({
      partnerId,
      partnerClientId,
      dto,
      exchangeType: PartnerExchangeType.CHARGE,
    });
  }

  /**
   * Sandbox 동기 REDEEM: 업체 잔액 감소(음수 허용) + 사용자 sellable 지급 + 수수료.
   */
  async redeem(
    partnerId: string,
    partnerClientId: string | null,
    dto: PartnerExchangeRequestDto,
  ): Promise<PartnerExchangeResponseDto> {
    return this.executeExchange({
      partnerId,
      partnerClientId,
      dto,
      exchangeType: PartnerExchangeType.REDEEM,
    });
  }

  private async executeExchange(params: {
    partnerId: string;
    partnerClientId: string | null;
    dto: PartnerExchangeRequestDto;
    exchangeType: PartnerExchangeType;
  }): Promise<PartnerExchangeResponseDto> {
    const { partnerId, partnerClientId, dto, exchangeType } = params;
    await this.requireActivePartner(partnerId);

    const existing = await this.exchangeRepository.findOne({
      where: { partnerId, idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return this.mapIdempotentExchange(
        existing,
        partnerId,
        exchangeType,
        dto,
      );
    }

    const link = await this.linkRepository.findOne({
      where: {
        partnerId,
        partnerUserKey: dto.partnerUserKey.trim(),
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    if (!link) {
      throw PartnerDomainException.linkNotFound();
    }

    const asset = await this.resolveAsset(partnerId, dto.assetCode);
    const feePolicy = await this.requireFeePolicy(partnerId, exchangeType);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const exchangeRepo = manager.getRepository(PartnerExchangeEntity);
        const dup = await exchangeRepo.findOne({
          where: { partnerId, idempotencyKey: dto.idempotencyKey },
          lock: { mode: 'pessimistic_write' },
        });
        if (dup) {
          return this.mapIdempotentExchange(dup, partnerId, exchangeType, dto);
        }

        const now = new Date();
        // Sandbox 동기 경로: 중간 상태 row를 여러 번 저장하지 않고
        // 타임스탬프만 남긴 뒤 COMPLETED로 확정한다. (비동기 MC는 이후 상태기계)
        const exchange = await exchangeRepo.save(
          exchangeRepo.create({
            exchangeNumber: this.nextExchangeNumber(exchangeType),
            idempotencyKey: dto.idempotencyKey,
            userPartnerLinkId: link.id,
            userId: link.userId,
            partnerId,
            partnerAssetId: asset.id,
            partnerClientId,
            exchangeType,
            amount: dto.amount,
            status: PartnerExchangeStatus.PARTNER_PROCESSING,
            partnerTransactionId: dto.partnerTransactionId ?? null,
            requestedAt: now,
            assetLockedAt: now,
            partnerProcessingAt: now,
          }),
        );

        const txId = randomUUID();

        if (exchangeType === PartnerExchangeType.CHARGE) {
          await this.coinService.debitNonSellable(manager, {
            userId: link.userId,
            amount: dto.amount,
            isSellable: false,
            entryType: CoinLedgerEntryType.PARTNER_CHARGE_DEBIT,
            referenceType: EXCHANGE_REF,
            referenceId: exchange.id,
            description: `Partner CHARGE ${exchange.exchangeNumber}`,
            transactionId: txId,
          });
          await this.partnerCoinService.creditAvailable(manager, {
            partnerId,
            amount: dto.amount,
            entryType: PartnerCoinLedgerEntryType.CHARGE_CREDIT,
            referenceType: EXCHANGE_REF,
            referenceId: exchange.id,
            description: `CHARGE ${exchange.exchangeNumber}`,
            transactionId: txId,
          });
        } else {
          await this.partnerCoinService.debitAvailable(manager, {
            partnerId,
            amount: dto.amount,
            entryType: PartnerCoinLedgerEntryType.REDEEM_DEBIT,
            referenceType: EXCHANGE_REF,
            referenceId: exchange.id,
            description: `REDEEM ${exchange.exchangeNumber}`,
            transactionId: txId,
          });
          await this.coinService.creditSellable(manager, {
            userId: link.userId,
            amount: dto.amount,
            sourceType: CoinSourceType.PARTNER_REDEEM,
            sourceId: exchange.id,
            entryType: CoinLedgerEntryType.PARTNER_REDEEM_CREDIT,
            referenceType: EXCHANGE_REF,
            referenceId: exchange.id,
            description: `Partner REDEEM ${exchange.exchangeNumber}`,
            isSellable: true,
            transactionId: txId,
          });
        }

        const { percentageFeeAmount, totalFeeAmount } = calculateTotalFee({
          grossAmount: dto.amount,
          feeRateBps: feePolicy.feeRateBps,
          fixedFeeAmount: feePolicy.fixedFeeAmount,
          roundingRule: feePolicy.roundingRule,
        });

        await manager.getRepository(PartnerFeeAccrualEntity).save(
          manager.getRepository(PartnerFeeAccrualEntity).create({
            partnerId,
            partnerExchangeId: exchange.id,
            feePolicyId: feePolicy.id,
            exchangeType,
            grossAmount: dto.amount,
            feeRateBps: feePolicy.feeRateBps,
            fixedFeeAmount: feePolicy.fixedFeeAmount,
            percentageFeeAmount,
            totalFeeAmount,
            status: PartnerFeeAccrualStatus.ACCRUED,
            accruedAt: now,
          }),
        );

        exchange.status = PartnerExchangeStatus.COMPLETED;
        exchange.completedAt = new Date();
        const saved = await exchangeRepo.save(exchange);
        return PartnerExchangeResponseDto.from(saved);
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.exchangeRepository.findOne({
        where: { partnerId, idempotencyKey: dto.idempotencyKey },
      });
      if (!raced) {
        throw PartnerDomainException.exchangeIdempotencyConflict();
      }
      return this.mapIdempotentExchange(
        raced,
        partnerId,
        exchangeType,
        dto,
      );
    }
  }

  private async resolveAsset(
    partnerId: string,
    assetCode?: string,
  ): Promise<PartnerAssetEntity> {
    if (assetCode?.trim()) {
      const asset = await this.assetRepository.findOne({
        where: {
          partnerId,
          assetCode: assetCode.trim().toUpperCase(),
          isActive: true,
        },
      });
      if (!asset) {
        throw PartnerDomainException.assetNotFound();
      }
      return asset;
    }
    const asset = await this.assetRepository.findOne({
      where: { partnerId, isActive: true },
      order: { createdAt: 'ASC' },
    });
    if (!asset) {
      throw PartnerDomainException.assetNotFound();
    }
    return asset;
  }

  private async requireFeePolicy(
    partnerId: string,
    exchangeType: PartnerExchangeType,
  ): Promise<PartnerFeePolicyEntity> {
    const preferredTarget =
      exchangeType === PartnerExchangeType.CHARGE
        ? PartnerFeeTarget.CHARGE
        : PartnerFeeTarget.REDEEM;
    const policy =
      await this.partnerFeePoliciesService.findApplicableActivePolicy(
        partnerId,
        preferredTarget,
      );
    if (!policy) {
      throw PartnerDomainException.feePolicyMissing();
    }
    return policy;
  }

  private mapIdempotentExchange(
    existing: PartnerExchangeEntity,
    partnerId: string,
    exchangeType: PartnerExchangeType,
    dto: PartnerExchangeRequestDto,
  ): PartnerExchangeResponseDto {
    if (
      existing.partnerId !== partnerId ||
      existing.exchangeType !== exchangeType ||
      existing.amount !== dto.amount
    ) {
      throw PartnerDomainException.exchangeIdempotencyConflict();
    }
    return PartnerExchangeResponseDto.from(existing);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }

  private async requireActivePartner(partnerId: string): Promise<PartnerEntity> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    if (partner.status !== PartnerStatus.ACTIVE) {
      throw PartnerDomainException.partnerNotActive();
    }
    return partner;
  }

  private nextExchangeNumber(type: PartnerExchangeType): string {
    const prefix = type === PartnerExchangeType.CHARGE ? 'PEX-C' : 'PEX-R';
    return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }
}
