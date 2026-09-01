import { AuditActionType } from '../domain/enums/audit-action-type.enum';
import { parseCoinAdjustmentSummary } from './audit-coin-adjustment.util';

describe('parseCoinAdjustmentSummary', () => {
  it('parses enriched credit afterData', () => {
    const summary = parseCoinAdjustmentSummary(
      AuditActionType.ADMIN_COIN_CREDIT,
      {
        transactionId: 'tx-1',
        amount: '10000',
        balanceType: 'NON_SELLABLE',
        wallet: { nonSellableBalance: '20000' },
      },
    );

    expect(summary).toEqual({
      transactionId: 'tx-1',
      amount: '10000',
      balanceType: 'NON_SELLABLE',
      deduction: null,
    });
  });

  it('parses enriched debit afterData', () => {
    const summary = parseCoinAdjustmentSummary(
      AuditActionType.ADMIN_COIN_DEBIT,
      {
        transactionId: 'tx-2',
        amount: '5000',
        deduction: {
          nonSellableAmount: '5000',
          sellableAmount: '0',
        },
        wallet: { nonSellableBalance: '15000' },
      },
    );

    expect(summary).toEqual({
      transactionId: 'tx-2',
      amount: '5000',
      balanceType: null,
      deduction: {
        nonSellableAmount: '5000',
        sellableAmount: '0',
      },
    });
  });

  it('returns null for legacy wallet-only afterData', () => {
    expect(
      parseCoinAdjustmentSummary(AuditActionType.ADMIN_COIN_CREDIT, {
        nonSellableBalance: '10000',
        sellableBalance: '0',
      }),
    ).toBeNull();
  });

  it('returns null for non-coin actions', () => {
    expect(
      parseCoinAdjustmentSummary(AuditActionType.CREATE_BANK, {
        transactionId: 'tx-3',
        amount: '1000',
      }),
    ).toBeNull();
  });
});
