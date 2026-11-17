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
import { PartnerExchangeCoinLotEntity } from './infrastructure/entities/partner-exchange-coin-lot.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerExchangeJobsService } from './partner-exchange-jobs.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { calculateTotalFee } from './utils/partner-fee.util';
import { maskPartnerUserKey } from './utils/mask-partner-user-key';

export type MePartnerLinkItemDto = {
  linkId: string;
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  partnerUserKeyMasked: string;
  status: UserPartnerLinkStatus;
  linkedAt: string;
};

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
    private readonly partnerExchangeJobsService: PartnerExchangeJobsService,
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
    const existing = await this.findActiveLinkConflict(
      partnerId,
      dto.userId,
      key,
    );
    if (existing) {
      return existing;
    }

    try {
      return await this.linkRepository.save(
        this.linkRepository.create({
          partnerId,
          userId: dto.userId,
          partnerUserKey: key,
          status: UserPartnerLinkStatus.ACTIVE,
          linkedAt: new Date(),
        }),
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.findActiveLinkConflict(
        partnerId,
        dto.userId,
        key,
      );
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  /**
   * POL-LINK-001: 같은 회원 키·같은 사용자의 ACTIVE 연결은 그대로 반환하고,
   * 한쪽만 겹치면 거절한다. 겹치는 연결이 없으면 null.
   */
  private async findActiveLinkConflict(
    partnerId: string,
    userId: string,
    partnerUserKey: string,
  ): Promise<UserPartnerLinkEntity | null> {
    const byKey = await this.linkRepository.findOne({
      where: { partnerId, partnerUserKey, status: UserPartnerLinkStatus.ACTIVE },
    });
    if (byKey) {
      if (byKey.userId === userId) {
        return byKey;
      }
      throw PartnerDomainException.linkAlreadyExists();
    }

    const byUser = await this.linkRepository.findOne({
      where: { partnerId, userId, status: UserPartnerLinkStatus.ACTIVE },
    });
    if (byUser) {
      throw PartnerDomainException.userAlreadyLinkedOtherKey();
    }
    return null;
  }

  /**
   * 연결 해제. 행은 UNLINKED로 남겨 전환·정산 이력을 보존한다.
   * 이미 시작된 전환은 시작 시점의 연결로 끝까지 처리되고, 이후 신규 전환만 막힌다.
   */
  async unlinkUser(
    partnerId: string,
    linkId: string,
  ): Promise<UserPartnerLinkEntity> {
    const link = await this.linkRepository.findOne({
      where: { id: linkId, partnerId },
    });
    if (!link) {
      throw PartnerDomainException.linkNotFound();
    }
    return this.markUnlinked(link);
  }

  /**
   * Partner API — 업체 회원 키의 연결 상태 조회 (SoT).
   * ACTIVE만 연결됨으로 본다. 없거나 UNLINKED면 NONE.
   */
  async getLinkByPartnerUserKey(
    partnerId: string,
    partnerUserKey: string,
  ): Promise<{
    status: 'ACTIVE' | 'NONE';
    linkId: string | null;
    partnerUserKey: string;
    linkedAt: string | null;
  }> {
    const key = partnerUserKey.trim();
    const link = await this.linkRepository.findOne({
      where: {
        partnerId,
        partnerUserKey: key,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    if (!link) {
      return {
        status: 'NONE',
        linkId: null,
        partnerUserKey: key,
        linkedAt: null,
      };
    }
    return {
      status: 'ACTIVE',
      linkId: link.id,
      partnerUserKey: link.partnerUserKey,
      linkedAt: link.linkedAt.toISOString(),
    };
  }

  /** B2 — 내 ACTIVE 업체 연결 목록 */
  async listLinksForUser(userId: string): Promise<MePartnerLinkItemDto[]> {
    const links = await this.linkRepository.find({
      where: { userId, status: UserPartnerLinkStatus.ACTIVE },
      relations: { partner: true },
      order: { linkedAt: 'DESC' },
    });
    return links.map((link) => ({
      linkId: link.id,
      partnerId: link.partnerId,
      partnerName: link.partner?.name ?? '',
      partnerCode: link.partner?.code ?? '',
      partnerUserKeyMasked: maskPartnerUserKey(link.partnerUserKey),
      status: link.status,
      linkedAt: link.linkedAt.toISOString(),
    }));
  }

  /** B2 — 본인 소유 연결만 해제 */
  async unlinkForUser(
    userId: string,
    linkId: string,
  ): Promise<MePartnerLinkItemDto> {
    const link = await this.linkRepository.findOne({
      where: { id: linkId, userId },
      relations: { partner: true },
    });
    if (!link) {
      throw PartnerDomainException.linkNotFound();
    }
    const saved = await this.markUnlinked(link);
    return {
      linkId: saved.id,
      partnerId: saved.partnerId,
      partnerName: link.partner?.name ?? '',
      partnerCode: link.partner?.code ?? '',
      partnerUserKeyMasked: maskPartnerUserKey(saved.partnerUserKey),
      status: saved.status,
      linkedAt: saved.linkedAt.toISOString(),
    };
  }

  private async markUnlinked(
    link: UserPartnerLinkEntity,
  ): Promise<UserPartnerLinkEntity> {
    if (link.status === UserPartnerLinkStatus.UNLINKED) {
      return link;
    }
    link.status = UserPartnerLinkStatus.UNLINKED;
    link.unlinkedAt = new Date();
    return this.linkRepository.save(link);
  }

  /**
   * Sandbox 동기 CHARGE: 사용자 MS 차감 + 업체 잔액 증가 + 수수료 스냅샷.
   * Intent Embed 경로(B4)는 `beginChargeLock`을 쓴다.
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
   * B4-1/B4-4: PIN 후 MS nonSellable 잠금 + Exchange ASSET_LOCKED + CREDIT job.
   * 잠금과 지급 Outbox는 동일 트랜잭션에서 커밋한다.
   * 업체 credit·수수료·COMPLETED는 Worker(B4-4) / settle(B4-3)이 담당.
   */
  async beginChargeLock(
    partnerId: string,
    partnerClientId: string | null,
    dto: PartnerExchangeRequestDto,
  ): Promise<PartnerExchangeResponseDto> {
    await this.requireActivePartner(partnerId);

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

    const user = await this.userService.findById(link.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw PartnerDomainException.userNotActiveForExchange();
    }

    const existing = await this.exchangeRepository.findOne({
      where: { partnerId, idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      await this.ensureInFlightCreditJob(existing);
      return this.mapIdempotentExchange(
        existing,
        partnerId,
        PartnerExchangeType.CHARGE,
        dto,
        link,
      );
    }

    const asset = await this.resolveAsset(partnerId, dto.assetCode);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const exchangeRepo = manager.getRepository(PartnerExchangeEntity);
        const dup = await exchangeRepo.findOne({
          where: { partnerId, idempotencyKey: dto.idempotencyKey },
          lock: { mode: 'pessimistic_write' },
        });
        if (dup) {
          if (this.isInFlightCharge(dup)) {
            await this.partnerExchangeJobsService.enqueueCreditJobInTransaction(
              manager,
              dup.id,
            );
          }
          return this.mapIdempotentExchange(
            dup,
            partnerId,
            PartnerExchangeType.CHARGE,
            dto,
            link,
          );
        }

        const now = new Date();
        const exchange = await exchangeRepo.save(
          exchangeRepo.create({
            exchangeNumber: this.nextExchangeNumber(PartnerExchangeType.CHARGE),
            idempotencyKey: dto.idempotencyKey,
            userPartnerLinkId: link.id,
            userId: link.userId,
            partnerId,
            partnerAssetId: asset.id,
            partnerClientId,
            exchangeType: PartnerExchangeType.CHARGE,
            amount: dto.amount,
            status: PartnerExchangeStatus.REQUESTED,
            partnerTransactionId: dto.partnerTransactionId ?? null,
            requestedAt: now,
          }),
        );

        const allocations = await this.coinService.lockNonSellableInTransaction(
          manager,
          {
            userId: link.userId,
            amount: dto.amount,
            referenceType: EXCHANGE_REF,
            referenceId: exchange.id,
            description: `Partner CHARGE lock ${exchange.exchangeNumber}`,
          },
        );

        const lotRepo = manager.getRepository(PartnerExchangeCoinLotEntity);
        for (const alloc of allocations) {
          await lotRepo.save(
            lotRepo.create({
              partnerExchangeId: exchange.id,
              coinLotId: alloc.coinLotId,
              lockedAmount: alloc.lockedAmount,
              remainingLockedAmount: alloc.lockedAmount,
            }),
          );
        }

        exchange.status = PartnerExchangeStatus.ASSET_LOCKED;
        exchange.assetLockedAt = new Date();
        const saved = await exchangeRepo.save(exchange);

        await this.partnerExchangeJobsService.enqueueCreditJobInTransaction(
          manager,
          saved.id,
          saved.assetLockedAt ?? now,
        );

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
      await this.ensureInFlightCreditJob(raced);
      return this.mapIdempotentExchange(
        raced,
        partnerId,
        PartnerExchangeType.CHARGE,
        dto,
        link,
      );
    }
  }

  private isInFlightCharge(exchange: PartnerExchangeEntity): boolean {
    return (
      exchange.status === PartnerExchangeStatus.ASSET_LOCKED ||
      exchange.status === PartnerExchangeStatus.PARTNER_PROCESSING ||
      exchange.status === PartnerExchangeStatus.RECONCILIATION_REQUIRED
    );
  }

  private async ensureInFlightCreditJob(
    exchange: PartnerExchangeEntity,
  ): Promise<void> {
    if (!this.isInFlightCharge(exchange)) {
      return;
    }
    await this.partnerExchangeJobsService.ensureCreditJob(exchange.id);
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

    const user = await this.userService.findById(link.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw PartnerDomainException.userNotActiveForExchange();
    }

    const existing = await this.exchangeRepository.findOne({
      where: { partnerId, idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return this.mapIdempotentExchange(
        existing,
        partnerId,
        exchangeType,
        dto,
        link,
      );
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
          return this.mapIdempotentExchange(
            dup,
            partnerId,
            exchangeType,
            dto,
            link,
          );
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
        link,
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
    link: UserPartnerLinkEntity,
  ): PartnerExchangeResponseDto {
    if (
      existing.partnerId !== partnerId ||
      existing.exchangeType !== exchangeType ||
      existing.amount !== dto.amount ||
      existing.userId !== link.userId ||
      existing.userPartnerLinkId !== link.id
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
