import {
  computeCompletionRatePct,
  faultCancelledTradeSql,
} from './trade-completion-rate';

describe('computeCompletionRatePct', () => {
  it('returns null when there is no rate base', () => {
    expect(computeCompletionRatePct(0, 0)).toBeNull();
  });

  it('floors the percentage', () => {
    expect(computeCompletionRatePct(2, 1)).toBe(66);
    expect(computeCompletionRatePct(5, 0)).toBe(100);
    expect(computeCompletionRatePct(0, 3)).toBe(0);
  });
});

describe('faultCancelledTradeSql', () => {
  it('uses the given trade alias', () => {
    const sql = faultCancelledTradeSql('tr', 'SELLER');
    expect(sql).toContain("tr.status = 'CANCELLED'");
    expect(sql).toContain('fault_e.trade_id = tr.id');
  });

  it('counts payment timeout only against the buyer', () => {
    expect(faultCancelledTradeSql('t', 'BUYER')).toContain("'PAYMENT_TIMEOUT'");
    expect(faultCancelledTradeSql('t', 'SELLER')).not.toContain(
      "'PAYMENT_TIMEOUT'",
    );
  });
});
