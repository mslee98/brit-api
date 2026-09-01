import { AuditActionType } from '../domain/enums/audit-action-type.enum';

export type CoinAdjustmentSummary = {
  transactionId: string;
  amount: string;
  balanceType: string | null;
  deduction: {
    nonSellableAmount: string;
    sellableAmount: string;
  } | null;
};

const COIN_ADJUSTMENT_ACTIONS = new Set<string>([
  AuditActionType.ADMIN_COIN_CREDIT,
  AuditActionType.ADMIN_COIN_DEBIT,
]);

export function isCoinAdjustmentAction(actionType: string): boolean {
  return COIN_ADJUSTMENT_ACTIONS.has(actionType);
}

/** afterData에서 Coin 보정 요약을 파싱한다. 구형(wallet-only) 레코드는 null. */
export function parseCoinAdjustmentSummary(
  actionType: string,
  afterData: Record<string, unknown> | null,
): CoinAdjustmentSummary | null {
  if (!afterData || !isCoinAdjustmentAction(actionType)) {
    return null;
  }

  const transactionId = afterData.transactionId;
  const amount = afterData.amount;
  if (typeof transactionId !== 'string' || typeof amount !== 'string') {
    return null;
  }

  const balanceType =
    typeof afterData.balanceType === 'string' ? afterData.balanceType : null;

  let deduction: CoinAdjustmentSummary['deduction'] = null;
  const rawDeduction = afterData.deduction;
  if (rawDeduction && typeof rawDeduction === 'object') {
    const d = rawDeduction as Record<string, unknown>;
    if (
      typeof d.nonSellableAmount === 'string' &&
      typeof d.sellableAmount === 'string'
    ) {
      deduction = {
        nonSellableAmount: d.nonSellableAmount,
        sellableAmount: d.sellableAmount,
      };
    }
  }

  return {
    transactionId,
    amount,
    balanceType,
    deduction,
  };
}
