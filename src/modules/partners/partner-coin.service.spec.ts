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

  it('CHARGE credit 후 REDEEM debit으로 음수 잔액을 허용한다', async () => {
    const m = manager() as never;

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
});
