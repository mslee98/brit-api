import { createHash } from 'crypto';

import { AdminCoinAdjustmentOperation } from '../domain/enums/admin-coin-adjustment-operation.enum';

/** IN_PROGRESS 고착 시 재시도 허용까지 대기 (5분) */
export const ADMIN_COIN_ADJUSTMENT_IN_PROGRESS_STALE_MS = 5 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function hashAdminCoinAdjustmentRequest(input: {
  operation: AdminCoinAdjustmentOperation;
  targetUserId: string;
  amount: string;
  sellable?: boolean;
  balanceType?: string;
  reason: string;
}): string {
  const payload: Record<string, string | boolean> = {
    amount: input.amount,
    operation: input.operation,
    reason: input.reason,
    targetUserId: input.targetUserId,
  };
  if (input.operation === AdminCoinAdjustmentOperation.CREDIT) {
    payload.sellable = Boolean(input.sellable);
  } else if (input.balanceType !== undefined) {
    payload.balanceType = input.balanceType;
  }

  const canonical = JSON.stringify(
    Object.keys(payload)
      .sort()
      .reduce<Record<string, string | boolean>>((acc, key) => {
        acc[key] = payload[key];
        return acc;
      }, {}),
  );

  return createHash('sha256').update(canonical).digest('hex');
}
