import { TradeDisputeStatus } from '../trades/domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../trades/domain/enums/trade-status.enum';

export const ONGOING_TRADE_STATUSES = new Set<TradeStatus>([
  TradeStatus.WAITING_BUYER_PAYMENT,
  TradeStatus.PAYMENT_TIMEOUT,
  TradeStatus.WAITING_SELLER_CONFIRMATION,
  TradeStatus.COIN_TRANSFERRING,
]);

export const OPEN_DISPUTE_STATUSES = new Set<TradeDisputeStatus>([
  TradeDisputeStatus.OPEN_UNASSIGNED,
  TradeDisputeStatus.ASSIGNED,
  TradeDisputeStatus.IN_REVIEW,
  TradeDisputeStatus.EVIDENCE_REQUIRED,
]);

export type AdminOpsTradeRow = {
  status: TradeStatus;
  count: string;
  paymentSum: string;
};

export type AdminOpsDisputeRow = {
  status: TradeDisputeStatus;
  count: string;
};

export function toCount(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function summarizeAdminTradeRows(tradeRows: AdminOpsTradeRow[]): {
  lifetimeTrades: number;
  ongoingTrades: number;
  completedTrades: number;
  cancelledTrades: number;
  ongoingPayment: bigint;
} {
  let lifetimeTrades = 0;
  let ongoingTrades = 0;
  let completedTrades = 0;
  let cancelledTrades = 0;
  let ongoingPayment = 0n;
  for (const row of tradeRows) {
    const count = toCount(row.count);
    lifetimeTrades += count;
    if (ONGOING_TRADE_STATUSES.has(row.status)) {
      ongoingTrades += count;
      ongoingPayment += BigInt(row.paymentSum || '0');
    }
    if (row.status === TradeStatus.COMPLETED) {
      completedTrades += count;
    }
    if (row.status === TradeStatus.CANCELLED) {
      cancelledTrades += count;
    }
  }
  return {
    lifetimeTrades,
    ongoingTrades,
    completedTrades,
    cancelledTrades,
    ongoingPayment,
  };
}

export function summarizeAdminDisputeRows(disputeRows: AdminOpsDisputeRow[]): {
  lifetimeDisputes: number;
  ongoingDisputes: number;
} {
  let lifetimeDisputes = 0;
  let ongoingDisputes = 0;
  for (const row of disputeRows) {
    const count = toCount(row.count);
    lifetimeDisputes += count;
    if (OPEN_DISPUTE_STATUSES.has(row.status)) {
      ongoingDisputes += count;
    }
  }
  return { lifetimeDisputes, ongoingDisputes };
}
