import { PartnerCoinLedgerEntryType } from './domain/enums/partner-coin-ledger-entry-type.enum';
import { PartnerCoinWalletStatus } from './domain/enums/partner-coin-wallet-status.enum';
import { PartnerCoinLedgerEntryEntity } from './infrastructure/entities/partner-coin-ledger-entry.entity';
import { PartnerCoinWalletEntity } from './infrastructure/entities/partner-coin-wallet.entity';
import { PartnerCoinService } from './partner-coin.service';

describe('PartnerCoinService', () => {
  const partnerId = 'partner-1';
  let wallets: Map<string, PartnerCoinWalletEntity>;
  let ledgers: PartnerCoinLedgerEntryEntity[];
  let service: PartnerCoinService;

  beforeEach(() => {
    wallets = new Map();
    ledgers = [];
    service = new PartnerCoinService();
  });

  function manager() {
    return {
      getRepository: (entity: unknown) => {
        if (entity === PartnerCoinWalletEntity) {
          return {
            findOne: async () => wallets.get(partnerId) ?? null,
            findOneOrFail: async () => {
              const w = wallets.get(partnerId);
              if (!w) throw new Error('missing wallet');
              return w;
            },
            create: (data: Partial<PartnerCoinWalletEntity>) =>
              ({ ...data }) as PartnerCoinWalletEntity,
            save: async (entity: PartnerCoinWalletEntity) => {
              wallets.set(entity.partnerId, { ...entity });
              return entity;
            },
          };
        }
        if (entity === PartnerCoinLedgerEntryEntity) {
          return {
            create: (data: Partial<PartnerCoinLedgerEntryEntity>) =>
              ({ ...data }) as PartnerCoinLedgerEntryEntity,
            save: async (entity: PartnerCoinLedgerEntryEntity) => {
              ledgers.push({ ...entity });
              return entity;
            },
          };
        }
        throw new Error('unexpected');
      },
    };
  }

  function redeem(amount: string, referenceId = 'ex-r') {
    return service.debitAvailable(manager() as never, {
      partnerId,
      amount,
      entryType: PartnerCoinLedgerEntryType.REDEEM_DEBIT,
      referenceType: 'PARTNER_EXCHANGE',
      referenceId,
    });
  }

  it('한도 안에서는 CHARGE credit 후 REDEEM debit으로 음수 잔액을 허용한다', async () => {
    const m = manager() as never;
    await service.updateCreditLimit(m, partnerId, '100000');

    await service.creditAvailable(m, {
      partnerId,
      amount: '30000',
      entryType: PartnerCoinLedgerEntryType.CHARGE_CREDIT,
      referenceType: 'PARTNER_EXCHANGE',
      referenceId: 'ex-1',
    });
    expect(wallets.get(partnerId)?.availableBalance).toBe('30000');
    expect(wallets.get(partnerId)?.status).toBe(PartnerCoinWalletStatus.ACTIVE);

    await service.debitAvailable(m, {
      partnerId,
      amount: '100000',
      entryType: PartnerCoinLedgerEntryType.REDEEM_DEBIT,
      referenceType: 'PARTNER_EXCHANGE',
      referenceId: 'ex-2',
    });

    expect(wallets.get(partnerId)?.availableBalance).toBe('-70000');
    expect(ledgers).toHaveLength(2);
    expect(ledgers[1].availableDelta).toBe('-100000');
  });

  describe('credit_limit', () => {
    it('기본 한도 0이면 잔액 0에서 REDEEM을 거절한다', async () => {
      await expect(redeem('1')).rejects.toMatchObject({
        response: { code: 'PARTNER_CREDIT_LIMIT_EXCEEDED' },
      });
      expect(wallets.get(partnerId)?.availableBalance).toBe('0');
      expect(ledgers).toHaveLength(0);
    });

    it('잔액이 정확히 -한도가 되는 REDEEM은 허용한다', async () => {
      await service.updateCreditLimit(manager() as never, partnerId, '50000');
      await redeem('50000');
      expect(wallets.get(partnerId)?.availableBalance).toBe('-50000');
    });

    it('한도를 넘는 REDEEM은 거절하고 잔액을 바꾸지 않는다', async () => {
      await service.updateCreditLimit(manager() as never, partnerId, '50000');
      await redeem('30000', 'ex-1');
      await expect(redeem('20001', 'ex-2')).rejects.toMatchObject({
        response: { code: 'PARTNER_CREDIT_LIMIT_EXCEEDED' },
      });
      expect(wallets.get(partnerId)?.availableBalance).toBe('-30000');
      expect(ledgers).toHaveLength(1);
    });

    it('요약에 남은 한도(available + credit_limit)를 담는다', async () => {
      const m = manager() as never;
      expect(await service.getWalletSummary(m, partnerId)).toEqual({
        availableBalance: '0',
        lockedBalance: '0',
        creditLimit: '0',
        remainingCredit: '0',
      });
      await service.updateCreditLimit(m, partnerId, '50000');
      await redeem('30000');
      expect(await service.getWalletSummary(m, partnerId)).toMatchObject({
        availableBalance: '-30000',
        creditLimit: '50000',
        remainingCredit: '20000',
      });
    });

    it('음수나 소수 한도는 거절한다', async () => {
      await expect(
        service.updateCreditLimit(manager() as never, partnerId, '-1'),
      ).rejects.toMatchObject({
        response: { code: 'PARTNER_CREDIT_LIMIT_INVALID' },
      });
    });
  });
});
