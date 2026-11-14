import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';

import { addAmount, subAmount } from '../coins/utils/coin-amount.util';
import { PartnerCoinLedgerEntryType } from './domain/enums/partner-coin-ledger-entry-type.enum';
import { PartnerCoinWalletStatus } from './domain/enums/partner-coin-wallet-status.enum';
import { PartnerDomainException } from './exceptions/partner.exceptions';
import { PartnerCoinLedgerEntryEntity } from './infrastructure/entities/partner-coin-ledger-entry.entity';
import { PartnerCoinWalletEntity } from './infrastructure/entities/partner-coin-wallet.entity';

type PartnerCoinMutationParams = {
  partnerId: string;
  amount: string;
  entryType: PartnerCoinLedgerEntryType;
  referenceType: string;
  referenceId: string | null;
  description?: string | null;
  transactionId?: string;
  sequenceNo?: number;
};

export type PartnerWalletSummary = {
  availableBalance: string;
  lockedBalance: string;
  creditLimit: string;
  remainingCredit: string;
};

/**
 * 업체 Coin Wallet/Ledger.
 * available_balance는 REDEEM으로 -credit_limit까지 음수 허용.
 */
@Injectable()
export class PartnerCoinService {
  async getWalletSummary(
    manager: EntityManager,
    partnerId: string,
  ): Promise<PartnerWalletSummary> {
    const wallet = await manager
      .getRepository(PartnerCoinWalletEntity)
      .findOne({ where: { partnerId } });
    return this.toSummary(
      wallet?.availableBalance ?? '0',
      wallet?.lockedBalance ?? '0',
      wallet?.creditLimit ?? '0',
    );
  }

  async updateCreditLimit(
    manager: EntityManager,
    partnerId: string,
    creditLimit: string,
  ): Promise<PartnerWalletSummary> {
    if (!/^(0|[1-9]\d*)$/.test(creditLimit)) {
      throw PartnerDomainException.invalidCreditLimit();
    }
    const wallet = await this.ensureWallet(manager, partnerId, {
      allowSuspended: true,
    });
    wallet.creditLimit = creditLimit;
    await manager.getRepository(PartnerCoinWalletEntity).save(wallet);
    return this.toSummary(
      wallet.availableBalance,
      wallet.lockedBalance,
      wallet.creditLimit,
    );
  }

  async ensureWallet(
    manager: EntityManager,
    partnerId: string,
    options: { allowSuspended?: boolean } = {},
  ): Promise<PartnerCoinWalletEntity> {
    const repo = manager.getRepository(PartnerCoinWalletEntity);
    let wallet = await repo.findOne({
      where: { partnerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = await repo.save(
        repo.create({
          partnerId,
          availableBalance: '0',
          lockedBalance: '0',
          creditLimit: '0',
          status: PartnerCoinWalletStatus.ACTIVE,
        }),
      );
      wallet = await repo.findOneOrFail({
        where: { partnerId },
        lock: { mode: 'pessimistic_write' },
      });
    }
    if (
      !options.allowSuspended &&
      wallet.status !== PartnerCoinWalletStatus.ACTIVE
    ) {
      throw PartnerDomainException.partnerWalletSuspended();
    }
    return wallet;
  }

  /** CHARGE 완료: 업체 available +amount */
  async creditAvailable(
    manager: EntityManager,
    params: PartnerCoinMutationParams,
  ): Promise<void> {
    this.assertPositive(params.amount);
    const wallet = await this.ensureWallet(manager, params.partnerId);
    wallet.availableBalance = addAmount(wallet.availableBalance, params.amount);
    await manager.getRepository(PartnerCoinWalletEntity).save(wallet);
    await this.insertLedger(manager, {
      ...params,
      availableDelta: params.amount,
      lockedDelta: '0',
    });
  }

  /** REDEEM 완료: 업체 available -amount (-credit_limit 아래로는 거절) */
  async debitAvailable(
    manager: EntityManager,
    params: PartnerCoinMutationParams,
  ): Promise<void> {
    this.assertPositive(params.amount);
    const wallet = await this.ensureWallet(manager, params.partnerId);
    const nextBalance = subAmount(wallet.availableBalance, params.amount);
    if (BigInt(nextBalance) < -BigInt(wallet.creditLimit ?? '0')) {
      throw PartnerDomainException.creditLimitExceeded();
    }
    wallet.availableBalance = nextBalance;
    await manager.getRepository(PartnerCoinWalletEntity).save(wallet);
    await this.insertLedger(manager, {
      ...params,
      availableDelta: `-${params.amount}`,
      lockedDelta: '0',
    });
  }

  private async insertLedger(
    manager: EntityManager,
    params: PartnerCoinMutationParams & {
      availableDelta: string;
      lockedDelta: string;
    },
  ): Promise<void> {
    const repo = manager.getRepository(PartnerCoinLedgerEntryEntity);
    await repo.save(
      repo.create({
        transactionId: params.transactionId ?? randomUUID(),
        sequenceNo: params.sequenceNo ?? 1,
        partnerId: params.partnerId,
        entryType: params.entryType,
        availableDelta: params.availableDelta,
        lockedDelta: params.lockedDelta,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        description: params.description ?? null,
      }),
    );
  }

  private toSummary(
    availableBalance: string,
    lockedBalance: string,
    creditLimit: string,
  ): PartnerWalletSummary {
    return {
      availableBalance,
      lockedBalance,
      creditLimit,
      remainingCredit: addAmount(availableBalance, creditLimit),
    };
  }

  private assertPositive(amount: string): void {
    if (!/^[1-9]\d*$/.test(amount)) {
      throw PartnerDomainException.invalidExchangeAmount();
    }
  }
}
