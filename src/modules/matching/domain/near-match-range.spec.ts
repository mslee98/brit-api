import { buyRangeForSell, sellRangeForBuy } from './near-match-range';

/** computeMatch와 같은 NEAR 판정 */
function isNear(buy: bigint, sell: bigint, ratioBps: number): boolean {
  const diff = sell > buy ? sell - buy : buy - sell;
  return diff * 10000n <= buy * BigInt(ratioBps);
}

describe('near-match-range', () => {
  const ratios = [0, 1, 500, 1000, 3333, 9999, 10000];
  const amounts = [1n, 7n, 9n, 10n, 11n, 99n, 100n, 101n, 1234n];

  it.each(ratios)(
    'sellRangeForBuy는 NEAR 판정과 경계가 같다 (ratio=%i)',
    (ratio) => {
      for (const buy of amounts) {
        const { min, max } = sellRangeForBuy(buy, ratio);
        for (let sell = 1n; sell <= buy * 3n; sell += 1n) {
          expect(sell >= min && sell <= max).toBe(isNear(buy, sell, ratio));
        }
      }
    },
  );

  it.each(ratios)(
    'buyRangeForSell은 NEAR 판정과 경계가 같다 (ratio=%i)',
    (ratio) => {
      for (const sell of amounts) {
        const { min, max } = buyRangeForSell(sell, ratio);
        for (let buy = 1n; buy <= sell * 3n; buy += 1n) {
          const inRange = buy >= min && (max === null || buy <= max);
          expect(inRange).toBe(isNear(buy, sell, ratio));
        }
      }
    },
  );
});
