/**
 * NEAR 판정 `|sell - buy| * 10000 <= buy * ratioBps`(computeMatch)를
 * 인덱스로 좁힐 수 있는 닫힌 범위로 바꾼다. EXACT(sell = buy)도 범위에 포함된다.
 */
const BPS = 10000n;

/** 구매 금액 기준 후보가 될 수 있는 판매 잔량 범위. */
export function sellRangeForBuy(
  buyAmount: string | bigint,
  ratioBps: number,
): { min: bigint; max: bigint } {
  const buy = BigInt(buyAmount);
  const tolerance = (buy * BigInt(ratioBps)) / BPS;
  const min = buy - tolerance;
  return { min: min > 0n ? min : 1n, max: buy + tolerance };
}

/** 판매 잔량 기준 이 판매를 후보로 볼 수 있는 구매 금액 범위. max null = 상한 없음. */
export function buyRangeForSell(
  sellAmount: string | bigint,
  ratioBps: number,
): { min: bigint; max: bigint | null } {
  const sell = BigInt(sellAmount);
  const ratio = BigInt(ratioBps);
  const numerator = sell * BPS;
  const plus = BPS + ratio;
  const min = (numerator + plus - 1n) / plus;
  const minus = BPS - ratio;
  const max = minus > 0n ? numerator / minus : null;
  return { min: min > 0n ? min : 1n, max };
}
