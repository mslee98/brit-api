import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import {
  decryptAccountNumber,
  encryptAccountNumber,
} from '../../common/utils/account-crypto.util';
import { PartnerClientEnvironment } from './domain/enums/partner-client-environment.enum';
import { PartnerClientProcessingModel } from './domain/enums/partner-client-processing-model.enum';
import { PartnerClientSecretStatus } from './domain/enums/partner-client-secret-status.enum';
import { PartnerClientSecretType } from './domain/enums/partner-client-secret-type.enum';
import { PartnerExchangeAttemptResult } from './domain/enums/partner-exchange-attempt-result.enum';
import { PartnerExchangeAttemptType } from './domain/enums/partner-exchange-attempt-type.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerClientSecretEntity } from './infrastructure/entities/partner-client-secret.entity';
import { PartnerClientEntity } from './infrastructure/entities/partner-client.entity';
import { PartnerExchangeAttemptEntity } from './infrastructure/entities/partner-exchange-attempt.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerChargeSettlementService } from './partner-charge-settlement.service';
import { PartnerOperationsClient } from './partner-operations.client';
import { hashOperationsRequestBody } from './utils/partner-operations-hmac.util';
import {
  assertSafeOperationsBaseUrl,
  operationsCreditPath,
  operationsStatusPath,
} from './utils/partner-operations-url.util';
import {
  isTerminalExternalResult,
  mergeExternalResultStatus,
} from './utils/partner-external-result.util';

export type StartPartnerCreditResult = {
  exchangeId: string;
  status: PartnerExchangeStatus;
  externalResultStatus: PartnerExternalResultStatus;
  partnerTransactionId: string | null;
  skipped: boolean;
  skipReason: string | null;
  settledStatus?: PartnerExchangeStatus | null;
};

/**
 * B4-2: 업체 Operations CREDIT/STATUS 오케스트레이션.
 * MS 차감·수수료는 하지 않는다 (B4-3).
 */
@Injectable()
export class PartnerOperationsService {
  private readonly logger = new Logger(PartnerOperationsService.name);

  constructor(
    @InjectRepository(PartnerExchangeEntity)
    private readonly exchangeRepository: Repository<PartnerExchangeEntity>,
    @InjectRepository(PartnerExchangeAttemptEntity)
    private readonly attemptRepository: Repository<PartnerExchangeAttemptEntity>,
    @InjectRepository(PartnerClientEntity)
    private readonly clientRepository: Repository<PartnerClientEntity>,
    @InjectRepository(PartnerClientSecretEntity)
    private readonly secretRepository: Repository<PartnerClientSecretEntity>,
    @InjectRepository(PartnerAssetEntity)
    private readonly assetRepository: Repository<PartnerAssetEntity>,
    @InjectRepository(UserPartnerLinkEntity)
    private readonly linkRepository: Repository<UserPartnerLinkEntity>,
    @InjectRepository(PartnerPaymentIntentEntity)
    private readonly intentRepository: Repository<PartnerPaymentIntentEntity>,
    private readonly operationsClient: PartnerOperationsClient,
    private readonly chargeSettlementService: PartnerChargeSettlementService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * ASSET_LOCKED Exchange에 대해 CREDIT 1회 시도.
   * 실행권: ASSET_LOCKED + NOT_REQUESTED 만 획득. 이미 진행 중이면 skip.
   */
  async startPartnerCredit(
    exchangeId: string,
  ): Promise<StartPartnerCreditResult> {
    const prepared = await this.dataSource.transaction(async (manager) => {
      const exchangeRepo = manager.getRepository(PartnerExchangeEntity);
      const attemptRepo = manager.getRepository(PartnerExchangeAttemptEntity);

      const exchange = await exchangeRepo.findOne({
        where: { id: exchangeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!exchange) {
        throw PartnerDomainException.exchangeNotFound();
      }

      if (
        exchange.status === PartnerExchangeStatus.PARTNER_PROCESSING &&
        exchange.externalResultStatus !==
          PartnerExternalResultStatus.NOT_REQUESTED
      ) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'ALREADY_IN_FLIGHT_OR_DONE',
        };
      }

      if (
        exchange.status !== PartnerExchangeStatus.ASSET_LOCKED ||
        exchange.externalResultStatus !==
          PartnerExternalResultStatus.NOT_REQUESTED
      ) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'NOT_ELIGIBLE',
        };
      }

      if (!exchange.partnerClientId) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'NO_PARTNER_CLIENT',
        };
      }

      const client = await manager.getRepository(PartnerClientEntity).findOne({
        where: { id: exchange.partnerClientId },
      });
      if (!client) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'CLIENT_MISSING',
        };
      }

      if (
        client.processingModel !== PartnerClientProcessingModel.BRIT_OPERATIONS
      ) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'LEGACY_CONFIRM_MODEL',
        };
      }

      // Sandbox 한정 실제 CREDIT (Production은 B4-3/4 전 금지)
      if (client.environment !== PartnerClientEnvironment.SANDBOX) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'PRODUCTION_CREDIT_DISABLED',
        };
      }

      if (!client.operationsBaseUrl) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'OPERATIONS_URL_MISSING',
        };
      }

      let baseUrl: string;
      try {
        baseUrl = assertSafeOperationsBaseUrl(
          client.operationsBaseUrl,
          client.environment,
        ).toString().replace(/\/$/, '');
      } catch {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'OPERATIONS_URL_INVALID',
        };
      }

      const secret = await manager
        .getRepository(PartnerClientSecretEntity)
        .findOne({
          where: {
            partnerClientId: client.id,
            secretType: PartnerClientSecretType.OPERATIONS_SIGNING_SECRET,
            status: PartnerClientSecretStatus.ACTIVE,
          },
          order: { createdAt: 'DESC' },
        });
      if (!secret?.secretEncrypted) {
        return {
          kind: 'skip' as const,
          exchange,
          reason: 'OPERATIONS_SECRET_MISSING',
        };
      }

      const encryptionKey = this.configService.getOrThrow<string>(
        'ACCOUNT_ENCRYPTION_KEY',
      );
      const signingSecret = decryptAccountNumber(
        secret.secretEncrypted,
        encryptionKey,
      );

      const link = await manager.getRepository(UserPartnerLinkEntity).findOne({
        where: { id: exchange.userPartnerLinkId },
      });
      const asset = await manager.getRepository(PartnerAssetEntity).findOne({
        where: { id: exchange.partnerAssetId },
      });
      const intent = await manager
        .getRepository(PartnerPaymentIntentEntity)
        .findOne({
          where: { partnerExchangeId: exchange.id },
        });

      const maxNo = await attemptRepo
        .createQueryBuilder('a')
        .select('COALESCE(MAX(a.attempt_no), 0)', 'max')
        .where('a.partner_exchange_id = :id', { id: exchange.id })
        .getRawOne<{ max: string }>();
      const attemptNo = Number(maxNo?.max ?? 0) + 1;
      const requestId = randomUUID();

      const bodyObj = {
        exchangeId: exchange.id,
        exchangeNumber: exchange.exchangeNumber,
        operation: 'CREDIT',
        partnerUserKey: link?.partnerUserKey ?? '',
        amount: exchange.amount,
        assetCode: asset?.assetCode ?? '',
        externalOrderId: intent?.externalOrderId ?? null,
        intentId: intent?.id ?? null,
      };
      const rawBody = JSON.stringify(bodyObj);
      const requestHash = hashOperationsRequestBody(rawBody);

      exchange.status = PartnerExchangeStatus.PARTNER_PROCESSING;
      exchange.partnerProcessingAt = new Date();
      exchange.externalResultStatus = PartnerExternalResultStatus.PROCESSING;
      exchange.externalResultAt = new Date();
      await exchangeRepo.save(exchange);

      const attempt = await attemptRepo.save(
        attemptRepo.create({
          partnerExchangeId: exchange.id,
          attemptNo,
          attemptType: PartnerExchangeAttemptType.CREDIT,
          requestId,
          requestHash,
          result: PartnerExchangeAttemptResult.REQUESTED,
          partnerStatus: null,
          partnerTransactionId: null,
          httpStatus: null,
          errorCode: null,
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null,
        }),
      );

      return {
        kind: 'call' as const,
        exchange,
        attempt,
        baseUrl,
        pathWithQuery: operationsCreditPath(),
        rawBody,
        signingSecret,
        keyId: secret.id,
      };
    });

    if (prepared.kind === 'skip') {
      return {
        exchangeId: prepared.exchange.id,
        status: prepared.exchange.status,
        externalResultStatus: prepared.exchange.externalResultStatus,
        partnerTransactionId: prepared.exchange.partnerTransactionId,
        skipped: true,
        skipReason: prepared.reason,
      };
    }

    // HTTP는 DB 트랜잭션 밖
    const callResult = await this.operationsClient.call({
      baseUrl: prepared.baseUrl,
      method: 'POST',
      pathWithQuery: prepared.pathWithQuery,
      rawBody: prepared.rawBody,
      signingSecret: prepared.signingSecret,
      keyId: prepared.keyId,
    });

    await this.persistCallOutcome({
      exchangeId: prepared.exchange.id,
      attemptId: prepared.attempt.id,
      callResult,
      attemptType: PartnerExchangeAttemptType.CREDIT,
    });

    return this.afterExternalOutcome(prepared.exchange.id);
  }

  /**
   * 업체 STATUS 재조회 → Attempt + externalResultStatus 원자 반영.
   * NOT_FOUND는 최종 실패로 올리지 않고 UNKNOWN 처리.
   */
  async syncPartnerResult(
    exchangeId: string,
  ): Promise<StartPartnerCreditResult> {
    const exchange = await this.exchangeRepository.findOne({
      where: { id: exchangeId },
    });
    if (!exchange) {
      throw PartnerDomainException.exchangeNotFound();
    }
    if (!exchange.partnerClientId) {
      throw PartnerDomainException.operationsNotConfigured();
    }

    const client = await this.clientRepository.findOne({
      where: { id: exchange.partnerClientId },
    });
    if (
      !client ||
      client.processingModel !== PartnerClientProcessingModel.BRIT_OPERATIONS ||
      !client.operationsBaseUrl
    ) {
      throw PartnerDomainException.operationsNotConfigured();
    }

    const baseUrl = assertSafeOperationsBaseUrl(
      client.operationsBaseUrl,
      client.environment,
    )
      .toString()
      .replace(/\/$/, '');

    const secret = await this.secretRepository.findOne({
      where: {
        partnerClientId: client.id,
        secretType: PartnerClientSecretType.OPERATIONS_SIGNING_SECRET,
        status: PartnerClientSecretStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
    if (!secret?.secretEncrypted) {
      throw PartnerDomainException.operationsNotConfigured();
    }

    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    const signingSecret = decryptAccountNumber(
      secret.secretEncrypted,
      encryptionKey,
    );

    const pathWithQuery = operationsStatusPath(exchange.id);
    const preparedAttempt = await this.dataSource.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(PartnerExchangeAttemptEntity);
      const maxNo = await attemptRepo
        .createQueryBuilder('a')
        .select('COALESCE(MAX(a.attempt_no), 0)', 'max')
        .where('a.partner_exchange_id = :id', { id: exchange.id })
        .getRawOne<{ max: string }>();
      const attemptNo = Number(maxNo?.max ?? 0) + 1;
      const requestId = randomUUID();
      const rawBody = '';
      return attemptRepo.save(
        attemptRepo.create({
          partnerExchangeId: exchange.id,
          attemptNo,
          attemptType: PartnerExchangeAttemptType.STATUS,
          requestId,
          requestHash: hashOperationsRequestBody(rawBody),
          result: PartnerExchangeAttemptResult.REQUESTED,
          startedAt: new Date(),
        }),
      );
    });

    const callResult = await this.operationsClient.call({
      baseUrl,
      method: 'GET',
      pathWithQuery,
      rawBody: '',
      signingSecret,
      keyId: secret.id,
    });

    await this.persistCallOutcome({
      exchangeId: exchange.id,
      attemptId: preparedAttempt.id,
      callResult,
      attemptType: PartnerExchangeAttemptType.STATUS,
    });

    return this.afterExternalOutcome(exchange.id);
  }

  private async afterExternalOutcome(
    exchangeId: string,
  ): Promise<StartPartnerCreditResult> {
    let settledStatus: PartnerExchangeStatus | null = null;
    try {
      const settled =
        await this.chargeSettlementService.settleIfTerminal(exchangeId);
      if (settled) {
        settledStatus = settled.status;
      }
    } catch (error) {
      this.logger.warn(
        `settleIfTerminal failed exchange=${exchangeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const fresh = await this.exchangeRepository.findOneOrFail({
      where: { id: exchangeId },
    });
    return {
      exchangeId: fresh.id,
      status: fresh.status,
      externalResultStatus: fresh.externalResultStatus,
      partnerTransactionId: fresh.partnerTransactionId,
      skipped: false,
      skipReason: null,
      settledStatus,
    };
  }

  /** Admin/포털용: Operations 서명 키 발급·URL·모델 설정 시 암호화 저장 */
  encryptOperationsSecret(plaintext: string): Buffer {
    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    return encryptAccountNumber(plaintext, encryptionKey);
  }

  private async persistCallOutcome(input: {
    exchangeId: string;
    attemptId: string;
    callResult: Awaited<ReturnType<PartnerOperationsClient['call']>>;
    attemptType: PartnerExchangeAttemptType;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const exchangeRepo = manager.getRepository(PartnerExchangeEntity);
      const attemptRepo = manager.getRepository(PartnerExchangeAttemptEntity);

      const exchange = await exchangeRepo.findOne({
        where: { id: input.exchangeId },
        lock: { mode: 'pessimistic_write' },
      });
      const attempt = await attemptRepo.findOne({
        where: { id: input.attemptId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!exchange || !attempt) return;

      const partnerStatus = input.callResult.partnerStatus;
      const attemptResult = this.mapAttemptResult(
        input.callResult,
        partnerStatus,
      );

      attempt.result = attemptResult;
      attempt.partnerStatus = partnerStatus;
      attempt.partnerTransactionId = input.callResult.partnerTransactionId;
      attempt.httpStatus = input.callResult.httpStatus;
      attempt.errorCode = input.callResult.errorCode;
      attempt.errorMessage = input.callResult.errorMessage;
      attempt.completedAt = new Date();
      await attemptRepo.save(attempt);

      const merged = mergeExternalResultStatus(
        exchange.externalResultStatus,
        partnerStatus,
      );
      if (merged === 'CONFLICT') {
        this.logger.error(
          `External result conflict exchange=${exchange.id} current=${exchange.externalResultStatus} incoming=${partnerStatus}`,
        );
        // 자동 변경 금지 — UNKNOWN으로만 표시해 대사 유도
        if (!isTerminalExternalResult(exchange.externalResultStatus)) {
          exchange.externalResultStatus = PartnerExternalResultStatus.UNKNOWN;
          exchange.externalResultAt = new Date();
        }
      } else {
        exchange.externalResultStatus = merged;
        exchange.externalResultAt = new Date();
        if (
          merged === PartnerExternalResultStatus.SUCCEEDED &&
          input.callResult.partnerTransactionId
        ) {
          exchange.partnerTransactionId = input.callResult.partnerTransactionId;
        }
      }

      // B4-2: Exchange.status는 PARTNER_PROCESSING 유지 (COMPLETED/FAILED_CONFIRMED 금지)
      if (exchange.status === PartnerExchangeStatus.ASSET_LOCKED) {
        exchange.status = PartnerExchangeStatus.PARTNER_PROCESSING;
        exchange.partnerProcessingAt =
          exchange.partnerProcessingAt ?? new Date();
      }
      await exchangeRepo.save(exchange);
    });
  }

  private mapAttemptResult(
    call: Awaited<ReturnType<PartnerOperationsClient['call']>>,
    partnerStatus: PartnerExternalResultStatus,
  ): PartnerExchangeAttemptResult {
    if (call.errorCode === 'OPERATIONS_TRANSPORT_ERROR') {
      return PartnerExchangeAttemptResult.TRANSPORT_ERROR;
    }
    switch (partnerStatus) {
      case PartnerExternalResultStatus.SUCCEEDED:
        return PartnerExchangeAttemptResult.SUCCEEDED;
      case PartnerExternalResultStatus.FAILED:
        return PartnerExchangeAttemptResult.FAILED;
      case PartnerExternalResultStatus.PROCESSING:
        return PartnerExchangeAttemptResult.PROCESSING;
      default:
        return PartnerExchangeAttemptResult.UNKNOWN;
    }
  }
}
