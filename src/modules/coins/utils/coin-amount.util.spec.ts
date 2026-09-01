import { addAmount, isPositiveAmountString, minAmount, subAmount } from './coin-amount.util';

describe('coin-amount.util', () => {
  it('adds and subtracts bigint strings', () => {
    expect(addAmount('100000', '20000')).toBe('120000');
    expect(subAmount('120000', '10000')).toBe('110000');
    expect(minAmount('30', '40')).toBe('30');
  });

  it('validates positive amount strings', () => {
    expect(isPositiveAmountString('1')).toBe(true);
    expect(isPositiveAmountString('100000')).toBe(true);
    expect(isPositiveAmountString('0')).toBe(false);
    expect(isPositiveAmountString('-1')).toBe(false);
    expect(isPositiveAmountString('01')).toBe(false);
    expect(isPositiveAmountString('1.5')).toBe(false);
  });
});
