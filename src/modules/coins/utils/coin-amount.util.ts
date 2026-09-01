/** bigint 금액 문자열 연산. float 사용 금지. */
export function addAmount(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

export function subAmount(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}

export function isPositiveAmountString(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

export function parseAmountOrThrow(value: string): bigint {
  if (!isPositiveAmountString(value)) {
    throw new Error('INVALID_COIN_AMOUNT');
  }
  return BigInt(value);
}

export function minAmount(a: string, b: string): string {
  return BigInt(a) <= BigInt(b) ? a : b;
}
