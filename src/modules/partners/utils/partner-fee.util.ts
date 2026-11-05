import { FeeRoundingRule } from '../domain/enums/fee-rounding-rule.enum';

/** gross * bps / 10000 을 rounding_rule에 맞게 정수 수수료로 계산 */
export function calculatePercentageFee(
  grossAmount: string,
  feeRateBps: number,
  roundingRule: FeeRoundingRule,
): string {
  const gross = BigInt(grossAmount);
  const numerator = gross * BigInt(feeRateBps);
  const denom = 10000n;

  switch (roundingRule) {
    case FeeRoundingRule.CEIL: {
      if (numerator === 0n) return '0';
      return ((numerator + denom - 1n) / denom).toString();
    }
    case FeeRoundingRule.ROUND: {
      return ((numerator + denom / 2n) / denom).toString();
    }
    case FeeRoundingRule.FLOOR:
    default:
      return (numerator / denom).toString();
  }
}

export function calculateTotalFee(params: {
  grossAmount: string;
  feeRateBps: number;
  fixedFeeAmount: string;
  roundingRule: FeeRoundingRule;
}): { percentageFeeAmount: string; totalFeeAmount: string } {
  const percentageFeeAmount = calculatePercentageFee(
    params.grossAmount,
    params.feeRateBps,
    params.roundingRule,
  );
  const totalFeeAmount = (
    BigInt(percentageFeeAmount) + BigInt(params.fixedFeeAmount)
  ).toString();
  return { percentageFeeAmount, totalFeeAmount };
}
