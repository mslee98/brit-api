import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CoinLedgerEntryType } from '../coins/domain/enums/coin-ledger-entry-type.enum';
import { CoinService } from '../coins/coin.service';
import { PartnerCoinLedgerEntryType } from './domain/enums/partner-coin-ledger-entry-type.enum';
import { PartnerExchangeEventType } from './domain/enums/partner-exchange-event-type.enum';
import { PartnerExchangeStatus } from './domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from './domain/enums/partner-exchange-type.enum';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';
import { PartnerFeeAccrualStatus } from './domain/enums/partner-fee-accrual-status.enum';
import { PartnerFeeTarget } from './domain/enums/partner-fee-target.enum';
import { PartnerPaymentIntentStatus } from './domain/enums/partner-payment-intent-status.enum';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerExchangeCoinLotEntity } from './infrastructure/entities/partner-exchange-coin-lot.entity';
import { PartnerExchangeEventEntity } from './infrastructure/entities/partner-exchange-event.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { PartnerWebhookDeliveriesService } from './partner-webhook-deliveries.service';
import { calculateTotalFee } from './utils/partner-fee.util';

const EXCHANGE_REF = 'PARTNER_EXCHANGE';

export type ChargeSettlementResult = {
  exchangeId: string;
  status: PartnerExchangeStatus;
  externalResultStatus: PartnerExternalResultStatus;
  intentStatus: PartnerPaymentIntentStatus | null;
  alreadySettled: boolean;
};

/**
 * B4-3: 외부 결과 확정 후 MS/업체/수수료/Intent를 한 트랜잭션에 닫는다.
 * Operations HTTP는 하지 않는다. B4-5: 이벤트와 Webhook Delivery를 같은 TX에 넣는다.
 */
@Injectable()
export class PartnerChargeSettlementService {
  private readonly logger = new Logger(PartnerChargeSettlementService.name);

  constructor(
    @InjectRepository(PartnerExchangeEntity)
    private readonly exchangeRepository: Repository<PartnerExchangeEntity>,
    private readonly coinService: CoinService,
    private readonly partnerCoinService: PartnerCoinService,
    private readonly partnerFeePoliciesService: PartnerFeePoliciesService,
    private readonly webhookDeliveriesService: PartnerWebhookDeliveriesService,
    private readonly dataSource: DataSource,
  ) {}

  async commit(exchangeId: string): Promise<ChargeSettlementResult> {
    return this.dataSource.transaction(async (manager) => {
      const exchange = await this.lockExchange(manager, exchangeId);

      if (exchange.status === PartnerExchangeStatus.COMPLETED) {
        await this.ensureWebhookForExistingEvent(
          manager,
          exchange,
          PartnerExchangeEventType.MERCHANT_PAYMENT_COMPLETED,
        );
        return this.toResult(manager, exchange, true);
      }
      if (exchange.status === PartnerExchangeStatus.FAILED_CONFIRMED) {
        throw PartnerDomainException.settlementConflict();
      }
      if (exchange.exchangeType !== PartnerExchangeType.CHARGE) {
        throw PartnerDomainException.settlementNotCharge();
      }
      if (
        exchange.externalResultStatus !== PartnerExternalResultStatus.SUCCEEDED
      ) {
        throw PartnerDomainException.settlementNotReady(
          exchange.externalResultStatus,
        );
      }
      if (
        exchange.status !== PartnerExchangeStatus.PARTNER_PROCESSING &&
        exchange.status !== PartnerExchangeStatus.ASSET_LOCKED &&
        exchange.status !== PartnerExchangeStatus.RECONCILIATION_REQUIRED
      ) {
        throw PartnerDomainException.settlementConflict();
      }
      if (!exchange.partnerTransactionId) {
        throw PartnerDomainException.settlementEvidenceMissing();
      }

      const lotRows = await manager
        .getRepository(PartnerExchangeCoinLotEntity)
        .find({
          where: { partnerExchangeId: exchange.id },
          lock: { mode: 'pessimistic_write' },
        });
      this.assertLotsReadyForCommit(exchange, lotRows);

      const txId = randomUUID();
      await this.coinService.consumeLockedNonSellableInTransaction(manager, {
        userId: exchange.userId,
        allocations: lotRows.map((row) => ({
          coinLotId: row.coinLotId,
          amount: row.remainingLockedAmount,
        })),
        entryType: CoinLedgerEntryType.PARTNER_CHARGE_DEBIT,
        referenceType: EXCHANGE_REF,
        referenceId: exchange.id,
        description: `Partner CHARGE settle ${exchange.exchangeNumber}`,
        transactionId: txId,
        sequenceNo: 1,
      });

      for (const row of lotRows) {
        row.remainingLockedAmount = '0';
        await manager.getRepository(PartnerExchangeCoinLotEntity).save(row);
      }

      await this.partnerCoinService.creditAvailable(manager, {
        partnerId: exchange.partnerId,
        amount: exchange.amount,
        entryType: PartnerCoinLedgerEntryType.CHARGE_CREDIT,
        referenceType: EXCHANGE_REF,
        referenceId: exchange.id,
        description: `CHARGE ${exchange.exchangeNumber}`,
        transactionId: txId,
      });

      await this.accrueFee(manager, exchange);

      const now = new Date();
      exchange.status = PartnerExchangeStatus.COMPLETED;
      exchange.completedAt = now;
      await manager.getRepository(PartnerExchangeEntity).save(exchange);

      const intent = await this.completeIntent(manager, exchange, now);

      const event = await this.recordEvent(manager, exchange, {
        eventType: PartnerExchangeEventType.MERCHANT_PAYMENT_COMPLETED,
        payload: {
          amount: exchange.amount,
          partnerTransactionId: exchange.partnerTransactionId,
          intentId: intent?.id ?? null,
        },
      });
      if (event) {
        await this.webhookDeliveriesService.enqueueForEventInTransaction(
          manager,
          event,
          exchange,
        );
      }

      return {
        exchangeId: exchange.id,
        status: exchange.status,
        externalResultStatus: exchange.externalResultStatus,
        intentStatus: intent?.status ?? null,
        alreadySettled: false,
      };
    });
  }

  async abort(exchangeId: string): Promise<ChargeSettlementResult> {
    return this.dataSource.transaction(async (manager) => {
      const exchange = await this.lockExchange(manager, exchangeId);

      if (exchange.status === PartnerExchangeStatus.FAILED_CONFIRMED) {
        await this.ensureWebhookForExistingEvent(
          manager,
          exchange,
          PartnerExchangeEventType.MERCHANT_PAYMENT_FAILED,
        );
        return this.toResult(manager, exchange, true);
      }
      if (exchange.status === PartnerExchangeStatus.COMPLETED) {
        throw PartnerDomainException.settlementConflict();
      }
      if (exchange.exchangeType !== PartnerExchangeType.CHARGE) {
        throw PartnerDomainException.settlementNotCharge();
      }
      if (
        exchange.externalResultStatus !== PartnerExternalResultStatus.FAILED
      ) {
        throw PartnerDomainException.settlementNotReady(
          exchange.externalResultStatus,
        );
      }
      if (
        exchange.status !== PartnerExchangeStatus.PARTNER_PROCESSING &&
        exchange.status !== PartnerExchangeStatus.ASSET_LOCKED &&
        exchange.status !== PartnerExchangeStatus.RECONCILIATION_REQUIRED
      ) {
        throw PartnerDomainException.settlementConflict();
      }

      const lotRows = await manager
        .getRepository(PartnerExchangeCoinLotEntity)
        .find({
          where: { partnerExchangeId: exchange.id },
          lock: { mode: 'pessimistic_write' },
        });
      this.assertLotsReadyForAbort(exchange, lotRows);

      const releaseAmount = lotRows
        .reduce((sum, row) => sum + BigInt(row.remainingLockedAmount), 0n)
        .toString();

      await this.coinService.releaseNonSellableInTransaction(manager, {
        userId: exchange.userId,
        amount: releaseAmount,
        allocations: lotRows.map((row) => ({
          coinLotId: row.coinLotId,
          availableToRelease: row.remainingLockedAmount,
        })),
        referenceType: EXCHANGE_REF,
        referenceId: exchange.id,
        description: `Partner CHARGE abort ${exchange.exchangeNumber}`,
      });

      for (const row of lotRows) {
        row.remainingLockedAmount = '0';
        await manager.getRepository(PartnerExchangeCoinLotEntity).save(row);
      }

      const now = new Date();
      exchange.status = PartnerExchangeStatus.FAILED_CONFIRMED;
      exchange.failedAt = now;
      exchange.failureCode = 'PARTNER_CREDIT_FAILED';
      exchange.failureMessage = '업체 포인트 지급이 최종 실패했어요.';
      await manager.getRepository(PartnerExchangeEntity).save(exchange);

      const intent = await this.failIntent(manager, exchange, now);

      const event = await this.recordEvent(manager, exchange, {
        eventType: PartnerExchangeEventType.MERCHANT_PAYMENT_FAILED,
        payload: {
          amount: exchange.amount,
          failureCode: exchange.failureCode,
          intentId: intent?.id ?? null,
        },
      });
      if (event) {
        await this.webhookDeliveriesService.enqueueForEventInTransaction(
          manager,
          event,
          exchange,
        );
      }

      return {
        exchangeId: exchange.id,
        status: exchange.status,
        externalResultStatus: exchange.externalResultStatus,
        intentStatus: intent?.status ?? null,
        alreadySettled: false,
      };
    });
  }

  /**
   * 외부 결과가 최종이면 commit/abort. 그 외는 null.
   */
  async settleIfTerminal(
    exchangeId: string,
  ): Promise<ChargeSettlementResult | null> {
    const exchange = await this.exchangeRepository.findOne({
      where: { id: exchangeId },
    });
    if (!exchange) {
      throw PartnerDomainException.exchangeNotFound();
    }
    if (
      exchange.externalResultStatus === PartnerExternalResultStatus.SUCCEEDED
    ) {
      return this.commit(exchangeId);
    }
    if (exchange.externalResultStatus === PartnerExternalResultStatus.FAILED) {
      return this.abort(exchangeId);
    }
    return null;
  }

  private async lockExchange(
    manager: EntityManager,
    exchangeId: string,
  ): Promise<PartnerExchangeEntity> {
    const exchange = await manager.getRepository(PartnerExchangeEntity).findOne({
      where: { id: exchangeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!exchange) {
      throw PartnerDomainException.exchangeNotFound();
    }
    return exchange;
  }

  private assertLotsReadyForCommit(
    exchange: PartnerExchangeEntity,
    lotRows: PartnerExchangeCoinLotEntity[],
  ): void {
    if (lotRows.length === 0) {
      throw PartnerDomainException.settlementLotsInvalid();
    }
    let lockedSum = 0n;
    let remainingSum = 0n;
    for (const row of lotRows) {
      lockedSum += BigInt(row.lockedAmount);
      remainingSum += BigInt(row.remainingLockedAmount);
      if (BigInt(row.remainingLockedAmount) <= 0n) {
        throw PartnerDomainException.settlementLotsInvalid();
      }
      if (BigInt(row.remainingLockedAmount) > BigInt(row.lockedAmount)) {
        throw PartnerDomainException.settlementLotsInvalid();
      }
    }
    if (
      lockedSum !== BigInt(exchange.amount) ||
      remainingSum !== BigInt(exchange.amount)
    ) {
      this.logger.error(
        `Lot mismatch exchange=${exchange.id} locked=${lockedSum} remaining=${remainingSum} amount=${exchange.amount}`,
      );
      throw PartnerDomainException.settlementLotsInvalid();
    }
  }

  private assertLotsReadyForAbort(
    exchange: PartnerExchangeEntity,
    lotRows: PartnerExchangeCoinLotEntity[],
  ): void {
    if (lotRows.length === 0) {
      throw PartnerDomainException.settlementLotsInvalid();
    }
    const remainingSum = lotRows.reduce(
      (sum, row) => sum + BigInt(row.remainingLockedAmount),
      0n,
    );
    if (remainingSum !== BigInt(exchange.amount)) {
      throw PartnerDomainException.settlementLotsInvalid();
    }
  }

  private async accrueFee(
    manager: EntityManager,
    exchange: PartnerExchangeEntity,
  ): Promise<void> {
    const existing = await manager.getRepository(PartnerFeeAccrualEntity).findOne({
      where: { partnerExchangeId: exchange.id },
    });
    if (existing) return;

    const intent = await manager.getRepository(PartnerPaymentIntentEntity).findOne({
      where: { partnerExchangeId: exchange.id },
    });

    let policy: PartnerFeePolicyEntity | null = null;
    if (intent?.feePolicyId) {
      policy = await manager.getRepository(PartnerFeePolicyEntity).findOne({
        where: { id: intent.feePolicyId },
      });
    }
    if (!policy) {
      policy =
        await this.partnerFeePoliciesService.findApplicableActivePolicy(
          exchange.partnerId,
          PartnerFeeTarget.CHARGE,
        );
    }
    if (!policy) {
      throw PartnerDomainException.feePolicyMissing();
    }

    const calculated = calculateTotalFee({
      grossAmount: exchange.amount,
      feeRateBps: policy.feeRateBps,
      fixedFeeAmount: policy.fixedFeeAmount,
      roundingRule: policy.roundingRule,
    });
    // Intent 스냅샷이 있으면 total은 스냅샷 우선 (승인 시점 견적)
    const totalFeeAmount = intent?.feeAmount ?? calculated.totalFeeAmount;
    const percentageFeeAmount =
      intent?.feeAmount != null
        ? (
            BigInt(intent.feeAmount) - BigInt(policy.fixedFeeAmount)
          ).toString()
        : calculated.percentageFeeAmount;

    await manager.getRepository(PartnerFeeAccrualEntity).save(
      manager.getRepository(PartnerFeeAccrualEntity).create({
        partnerId: exchange.partnerId,
        partnerExchangeId: exchange.id,
        feePolicyId: policy.id,
        exchangeType: PartnerExchangeType.CHARGE,
        grossAmount: exchange.amount,
        feeRateBps: policy.feeRateBps,
        fixedFeeAmount: policy.fixedFeeAmount,
        percentageFeeAmount:
          BigInt(percentageFeeAmount) < 0n ? '0' : percentageFeeAmount,
        totalFeeAmount,
        status: PartnerFeeAccrualStatus.ACCRUED,
        accruedAt: new Date(),
      }),
    );
  }

  private async completeIntent(
    manager: EntityManager,
    exchange: PartnerExchangeEntity,
    now: Date,
  ): Promise<PartnerPaymentIntentEntity | null> {
    const intent = await manager.getRepository(PartnerPaymentIntentEntity).findOne({
      where: { partnerExchangeId: exchange.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!intent) return null;
    intent.status = PartnerPaymentIntentStatus.COMPLETED;
    intent.completedAt = now;
    intent.failureCode = null;
    intent.failureMessage = null;
    return manager.getRepository(PartnerPaymentIntentEntity).save(intent);
  }

  private async failIntent(
    manager: EntityManager,
    exchange: PartnerExchangeEntity,
    now: Date,
  ): Promise<PartnerPaymentIntentEntity | null> {
    const intent = await manager.getRepository(PartnerPaymentIntentEntity).findOne({
      where: { partnerExchangeId: exchange.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!intent) return null;
    intent.status = PartnerPaymentIntentStatus.FAILED;
    intent.failedAt = now;
    intent.failureCode = exchange.failureCode;
    intent.failureMessage = exchange.failureMessage;
    return manager.getRepository(PartnerPaymentIntentEntity).save(intent);
  }

  private async recordEvent(
    manager: EntityManager,
    exchange: PartnerExchangeEntity,
    input: {
      eventType: PartnerExchangeEventType;
      payload: Record<string, unknown>;
    },
  ): Promise<PartnerExchangeEventEntity | null> {
    const repo = manager.getRepository(PartnerExchangeEventEntity);
    const existing = await repo.findOne({
      where: {
        partnerExchangeId: exchange.id,
        eventType: input.eventType,
      },
    });
    if (existing) {
      return existing;
    }
    return repo.save(
      repo.create({
        partnerExchangeId: exchange.id,
        eventType: input.eventType,
        payload: input.payload,
      }),
    );
  }

  private async ensureWebhookForExistingEvent(
    manager: EntityManager,
    exchange: PartnerExchangeEntity,
    eventType: PartnerExchangeEventType,
  ): Promise<void> {
    const event = await manager.getRepository(PartnerExchangeEventEntity).findOne({
      where: { partnerExchangeId: exchange.id, eventType },
    });
    if (!event) {
      return;
    }
    await this.webhookDeliveriesService.enqueueForEventInTransaction(
      manager,
      event,
      exchange,
    );
  }

  private async toResult(
    manager: EntityManager,
    exchange: PartnerExchangeEntity,
    alreadySettled: boolean,
  ): Promise<ChargeSettlementResult> {
    const intent = await manager.getRepository(PartnerPaymentIntentEntity).findOne({
      where: { partnerExchangeId: exchange.id },
    });
    return {
      exchangeId: exchange.id,
      status: exchange.status,
      externalResultStatus: exchange.externalResultStatus,
      intentStatus: intent?.status ?? null,
      alreadySettled,
    };
  }
}
