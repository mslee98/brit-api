import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CoinService } from '../coins/coin.service';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { PartnerFeeTarget } from './domain/enums/partner-fee-target.enum';
import { PartnerPaymentIntentStatus } from './domain/enums/partner-payment-intent-status.enum';
import { PartnerStatus } from './domain/enums/partner-status.enum';
import { UserPartnerLinkStatus } from './domain/enums/user-partner-link-status.enum';
import {
  AuthorizePartnerPaymentIntentDto,
  CreatePartnerPaymentIntentDto,
  EmbedPaymentIntentDto,
  EmbedPaymentIntentStatusDto,
  PartnerPaymentIntentCreatedDto,
  PartnerPaymentIntentViewDto,
} from './dto/partner-payment-intent.dto';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerClientOriginEntity } from './infrastructure/entities/partner-client-origin.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { calculateTotalFee } from './utils/partner-fee.util';
import { maskPartnerUserKey } from './utils/mask-partner-user-key';

/** Intent 유효 시간 — merchant.md §7.4 예시(10분) */
const INTENT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_EMBED_BASE_URL = 'http://localhost:5173';

@Injectable()
export class PartnerPaymentIntentsService {
  constructor(
    @InjectRepository(PartnerPaymentIntentEntity)
    private readonly intentRepository: Repository<PartnerPaymentIntentEntity>,
    @InjectRepository(PartnerClientOriginEntity)
    private readonly originRepository: Repository<PartnerClientOriginEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepository: Repository<PartnerEntity>,
    @InjectRepository(PartnerAssetEntity)
    private readonly assetRepository: Repository<PartnerAssetEntity>,
    @InjectRepository(UserPartnerLinkEntity)
    private readonly linkRepository: Repository<UserPartnerLinkEntity>,
    private readonly partnerExchangeService: PartnerExchangeService,
    private readonly partnerFeePoliciesService: PartnerFeePoliciesService,
    private readonly userService: UserService,
    private readonly coinService: CoinService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    partnerId: string,
    partnerClientId: string,
    dto: CreatePartnerPaymentIntentDto,
  ): Promise<PartnerPaymentIntentCreatedDto> {
    await this.requireActivePartner(partnerId);

    const returnOrigin = normalizeOrigin(dto.returnOrigin);
    if (!returnOrigin) {
      throw PartnerDomainException.linkOriginNotAllowed();
    }
    const registered = await this.originRepository.find({
      where: { partnerClientId },
    });
    if (!registered.some((o) => normalizeOrigin(o.origin) === returnOrigin)) {
      throw PartnerDomainException.linkOriginNotAllowed();
    }

    const partnerUserKey = dto.partnerUserKey.trim();
    const amount = dto.amount.trim();
    const externalOrderId = dto.externalOrderId.trim();
    const assetCode = dto.assetCode?.trim().toUpperCase() || null;

    await this.resolveAsset(partnerId, assetCode ?? undefined);

    const feePolicy =
      await this.partnerFeePoliciesService.findApplicableActivePolicy(
        partnerId,
        PartnerFeeTarget.CHARGE,
      );
    if (!feePolicy) {
      throw PartnerDomainException.feePolicyMissing();
    }
    const { totalFeeAmount } = calculateTotalFee({
      grossAmount: amount,
      feeRateBps: feePolicy.feeRateBps,
      fixedFeeAmount: feePolicy.fixedFeeAmount,
      roundingRule: feePolicy.roundingRule,
    });
    // Sandbox 동기 CHARGE와 동일: 사용자 MS 차감은 amount. 수수료는 accrual 스냅샷.
    const totalDebit = amount;

    const existing = await this.intentRepository.findOne({
      where: { partnerId, externalOrderId },
    });
    if (existing) {
      if (
        existing.partnerUserKey !== partnerUserKey ||
        existing.amount !== amount ||
        (existing.assetCode ?? null) !== assetCode
      ) {
        throw PartnerDomainException.paymentIntentConflict();
      }
      return this.toCreatedDto(existing);
    }

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const intent = await this.intentRepository.save(
      this.intentRepository.create({
        partnerId,
        partnerClientId,
        externalOrderId,
        partnerUserKey,
        amount,
        feeAmount: totalFeeAmount,
        totalDebit,
        assetCode,
        returnOrigin,
        status: PartnerPaymentIntentStatus.CREATED,
        expiresAt,
        metadata: dto.metadata ?? null,
      }),
    );

    return this.toCreatedDto(intent);
  }

  async getForPartner(
    partnerId: string,
    intentId: string,
  ): Promise<PartnerPaymentIntentViewDto> {
    const intent = await this.intentRepository.findOne({
      where: { id: intentId, partnerId },
    });
    if (!intent) {
      throw PartnerDomainException.paymentIntentNotFound();
    }
    await this.expireIfNeeded(intent);
    return this.toPartnerView(intent);
  }

  async getForEmbed(
    intentId: string,
    userId: string,
  ): Promise<EmbedPaymentIntentDto> {
    const intent = await this.requireIntent(intentId);
    await this.expireIfNeeded(intent);

    const partner = await this.partnerRepository.findOne({
      where: { id: intent.partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }

    const link = await this.linkRepository.findOne({
      where: {
        partnerId: intent.partnerId,
        partnerUserKey: intent.partnerUserKey,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });

    let canAuthorize = false;
    let blockReason: string | null = null;
    let nonSellableBalanceMs: string | null = null;

    if (intent.status === PartnerPaymentIntentStatus.COMPLETED) {
      blockReason = '이미 완료된 충전이에요.';
    } else if (intent.status === PartnerPaymentIntentStatus.CANCELLED) {
      blockReason = '취소된 충전 요청이에요.';
    } else if (intent.status === PartnerPaymentIntentStatus.EXPIRED) {
      blockReason = '충전 요청 시간이 지났어요.';
    } else if (intent.status === PartnerPaymentIntentStatus.FAILED) {
      blockReason = intent.failureMessage ?? '충전에 실패했어요.';
    } else if (!link) {
      blockReason = '먼저 업체와 BRIT 계정을 연결해 주세요.';
    } else if (link.userId !== userId) {
      blockReason =
        '이 BRIT 계정은 해당 업체 회원과 연결되어 있지 않아요. 연결한 계정으로 로그인해 주세요.';
    } else {
      const user = await this.userService.findById(userId);
      if (!user || user.status !== UserStatus.ACTIVE) {
        blockReason = 'ACTIVE 사용자만 충전할 수 있어요.';
      } else {
        canAuthorize = intent.status === PartnerPaymentIntentStatus.CREATED;
        try {
          const wallet = await this.coinService.getWallet(userId);
          nonSellableBalanceMs = wallet.nonSellableBalance;
          if (
            canAuthorize &&
            BigInt(wallet.nonSellableBalance) < BigInt(intent.totalDebit)
          ) {
            canAuthorize = false;
            blockReason = '판매 불가 MS 잔액이 부족해요.';
          }
        } catch {
          nonSellableBalanceMs = null;
        }
      }
    }

    const productName =
      intent.metadata &&
      typeof intent.metadata.productName === 'string'
        ? intent.metadata.productName
        : null;

    return {
      intentId: intent.id,
      partnerName: partner.name,
      partnerCode: partner.code,
      partnerUserKeyMasked: maskPartnerUserKey(intent.partnerUserKey),
      chargeAmountMs: intent.amount,
      feeAmountMs: intent.feeAmount,
      totalDebitMs: intent.totalDebit,
      assetCode: intent.assetCode,
      nonSellableBalanceMs,
      status: intent.status,
      returnOrigin: intent.returnOrigin,
      expiresAt: intent.expiresAt.toISOString(),
      productName,
      canAuthorize,
      blockReason,
    };
  }

  async authorize(
    intentId: string,
    userId: string,
    dto: AuthorizePartnerPaymentIntentDto,
  ): Promise<EmbedPaymentIntentStatusDto> {
    const intent = await this.requireIntent(intentId);
    await this.expireIfNeeded(intent);

    if (intent.status === PartnerPaymentIntentStatus.COMPLETED) {
      if (intent.authorizedUserId === userId) {
        return this.toEmbedStatus(intent);
      }
      throw PartnerDomainException.paymentIntentNotAuthorizable();
    }
    if (intent.status !== PartnerPaymentIntentStatus.CREATED) {
      throw PartnerDomainException.paymentIntentNotAuthorizable();
    }

    const link = await this.linkRepository.findOne({
      where: {
        partnerId: intent.partnerId,
        partnerUserKey: intent.partnerUserKey,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    if (!link) {
      throw PartnerDomainException.paymentIntentNotLinked();
    }
    if (link.userId !== userId) {
      throw PartnerDomainException.paymentIntentUserMismatch();
    }

    const user = await this.userService.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw PartnerDomainException.userNotActiveForExchange();
    }

    await this.userService.verifyTransactionPin(userId, dto.pin);

    intent.status = PartnerPaymentIntentStatus.USER_AUTHORIZED;
    intent.authorizedUserId = userId;
    intent.authorizedAt = new Date();
    await this.intentRepository.save(intent);

    try {
      const exchange = await this.partnerExchangeService.charge(
        intent.partnerId,
        intent.partnerClientId,
        {
          idempotencyKey: `intent:${intent.id}`,
          partnerUserKey: intent.partnerUserKey,
          amount: intent.amount,
          assetCode: intent.assetCode ?? undefined,
          partnerTransactionId: intent.externalOrderId,
        },
      );

      intent.status = PartnerPaymentIntentStatus.COMPLETED;
      intent.partnerExchangeId = exchange.id;
      intent.completedAt = new Date();
      intent.failureCode = null;
      intent.failureMessage = null;
      await this.intentRepository.save(intent);
      return this.toEmbedStatus(intent);
    } catch (error) {
      const { code, message } = extractFailure(error);
      intent.status = PartnerPaymentIntentStatus.FAILED;
      intent.failedAt = new Date();
      intent.failureCode = code;
      intent.failureMessage = message;
      await this.intentRepository.save(intent);
      throw error;
    }
  }

  async cancel(
    intentId: string,
    userId: string,
  ): Promise<EmbedPaymentIntentStatusDto> {
    const intent = await this.requireIntent(intentId);
    await this.expireIfNeeded(intent);

    if (intent.status === PartnerPaymentIntentStatus.CANCELLED) {
      return this.toEmbedStatus(intent);
    }
    if (intent.status !== PartnerPaymentIntentStatus.CREATED) {
      throw PartnerDomainException.paymentIntentNotAuthorizable();
    }

    const link = await this.linkRepository.findOne({
      where: {
        partnerId: intent.partnerId,
        partnerUserKey: intent.partnerUserKey,
        status: UserPartnerLinkStatus.ACTIVE,
      },
    });
    // 연결이 없어도 본인 팝업에서 취소를 허용하려면 returnOrigin만으로 부족.
    // 로그인 사용자 + CREATED면 취소 가능. 링크 소유자면 더 확실.
    if (link && link.userId !== userId) {
      throw PartnerDomainException.paymentIntentUserMismatch();
    }

    intent.status = PartnerPaymentIntentStatus.CANCELLED;
    intent.cancelledAt = new Date();
    await this.intentRepository.save(intent);
    return this.toEmbedStatus(intent);
  }

  async statusForEmbed(
    intentId: string,
    userId: string,
  ): Promise<EmbedPaymentIntentStatusDto> {
    const intent = await this.requireIntent(intentId);
    await this.expireIfNeeded(intent);
    // 상태 조회는 링크 소유 또는 승인 사용자만
    if (intent.authorizedUserId && intent.authorizedUserId !== userId) {
      const link = await this.linkRepository.findOne({
        where: {
          partnerId: intent.partnerId,
          partnerUserKey: intent.partnerUserKey,
          status: UserPartnerLinkStatus.ACTIVE,
        },
      });
      if (!link || link.userId !== userId) {
        throw PartnerDomainException.paymentIntentNotFound();
      }
    }
    return this.toEmbedStatus(intent);
  }

  private async requireIntent(
    intentId: string,
  ): Promise<PartnerPaymentIntentEntity> {
    const intent = await this.intentRepository.findOne({
      where: { id: intentId },
    });
    if (!intent) {
      throw PartnerDomainException.paymentIntentNotFound();
    }
    return intent;
  }

  private async expireIfNeeded(
    intent: PartnerPaymentIntentEntity,
  ): Promise<void> {
    if (
      intent.status === PartnerPaymentIntentStatus.CREATED &&
      intent.expiresAt.getTime() <= Date.now()
    ) {
      intent.status = PartnerPaymentIntentStatus.EXPIRED;
      await this.intentRepository.save(intent);
    }
  }

  private async requireActivePartner(partnerId: string): Promise<void> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });
    if (!partner) {
      throw PartnerDomainException.notFound();
    }
    if (partner.status !== PartnerStatus.ACTIVE) {
      throw PartnerDomainException.partnerNotActive();
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

  private toCreatedDto(
    intent: PartnerPaymentIntentEntity,
  ): PartnerPaymentIntentCreatedDto {
    const expiresInSec = Math.max(
      0,
      Math.floor((intent.expiresAt.getTime() - Date.now()) / 1000),
    );
    return {
      intentId: intent.id,
      payUrl: `${this.embedBaseUrl()}/embed-pay.html#intent=${intent.id}`,
      chargeAmountMs: intent.amount,
      feeAmountMs: intent.feeAmount,
      totalDebitMs: intent.totalDebit,
      status: intent.status,
      expiresAt: intent.expiresAt.toISOString(),
      expiresInSec,
    };
  }

  private toPartnerView(
    intent: PartnerPaymentIntentEntity,
  ): PartnerPaymentIntentViewDto {
    return {
      intentId: intent.id,
      externalOrderId: intent.externalOrderId,
      partnerUserKey: intent.partnerUserKey,
      chargeAmountMs: intent.amount,
      feeAmountMs: intent.feeAmount,
      totalDebitMs: intent.totalDebit,
      assetCode: intent.assetCode,
      status: intent.status,
      expiresAt: intent.expiresAt.toISOString(),
      partnerExchangeId: intent.partnerExchangeId,
      failureCode: intent.failureCode,
      failureMessage: intent.failureMessage,
      completedAt: intent.completedAt?.toISOString() ?? null,
      createdAt: intent.createdAt.toISOString(),
    };
  }

  private toEmbedStatus(
    intent: PartnerPaymentIntentEntity,
  ): EmbedPaymentIntentStatusDto {
    return {
      intentId: intent.id,
      status: intent.status,
      returnOrigin: intent.returnOrigin,
      partnerExchangeId: intent.partnerExchangeId,
      failureCode: intent.failureCode,
      failureMessage: intent.failureMessage,
    };
  }

  private embedBaseUrl(): string {
    return (
      this.configService.get<string>('BRIT_EMBED_BASE_URL') ??
      DEFAULT_EMBED_BASE_URL
    ).replace(/\/$/, '');
  }
}

function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function extractFailure(error: unknown): { code: string; message: string } {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      const code =
        typeof record.code === 'string' ? record.code : 'PARTNER_PAYMENT_FAILED';
      const message =
        typeof record.message === 'string' ? record.message : error.message;
      return { code, message };
    }
    return { code: 'PARTNER_PAYMENT_FAILED', message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'PARTNER_PAYMENT_FAILED', message: error.message };
  }
  return { code: 'PARTNER_PAYMENT_FAILED', message: '충전에 실패했어요.' };
}
