import { FeeRoundingRule } from '../domain/enums/fee-rounding-rule.enum';
import {
  calculatePercentageFee,
  calculateTotalFee,
} from './partner-fee.util';

describe('partner-fee.util', () => {
  describe('calculatePercentageFee', () => {
    it('FLOOR: 50000 * 70bps = 350', () => {
      expect(
        calculatePercentageFee('50000', 70, FeeRoundingRule.FLOOR),
      ).toBe('350');
    });

    it('FLOOR truncates fraction', () => {
      // 100 * 1 / 10000 = 0.01 → 0
      expect(calculatePercentageFee('100', 1, FeeRoundingRule.FLOOR)).toBe(
        '0',
      );
    });

    it('CEIL rounds up any fraction', () => {
      expect(calculatePercentageFee('100', 1, FeeRoundingRule.CEIL)).toBe(
        '1',
      );
    });

    it('ROUND half up', () => {
      // 15000 * 1 / 10000 = 1.5 → 2
      expect(calculatePercentageFee('15000', 1, FeeRoundingRule.ROUND)).toBe(
        '2',
      );
    });
  });

  describe('calculateTotalFee', () => {
    it('percentage + fixed', () => {
      expect(
        calculateTotalFee({
          grossAmount: '50000',
          feeRateBps: 70,
          fixedFeeAmount: '10',
          roundingRule: FeeRoundingRule.FLOOR,
        }),
      ).toEqual({
        percentageFeeAmount: '350',
        totalFeeAmount: '360',
      });
    });
  });
});
