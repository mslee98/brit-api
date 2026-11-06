import { TransactionKind } from './enums/transaction-kind.enum';
import { TransactionStatus } from './enums/transaction-status.enum';

/** 요약 SQL 한 행 = (날짜, 종류, 방향, 상태) 묶음 */
export type TransactionSummaryRow = {
  day: string;
  kind: TransactionKind;
  direction: 'IN' | 'OUT';
  status: TransactionStatus;
  amount: string;
  count: number;
};

export type TransactionDaySummary = {
  date: string;
  inflow: string;
  outflow: string;
  net: string;
  count: number;
  hasOpen: boolean;
};

export type TransactionSummary = {
  inflow: string;
  outflow: string;
  net: string;
  count: number;
  openCount: number;
  byKind: Record<TransactionKind, string>;
  byDay: TransactionDaySummary[];
};

const OPEN_STATUSES = new Set([
  TransactionStatus.PROCESSING,
  TransactionStatus.CHECKING,
]);

type DayAccumulator = {
  inflow: bigint;
  outflow: bigint;
  count: number;
  hasOpen: boolean;
};

/** 건수는 모든 상태, Coin 합계는 완료 건만 센다. */
export function summarizeTransactionRows(
  rows: TransactionSummaryRow[],
): TransactionSummary {
  let inflow = 0n;
  let outflow = 0n;
  let count = 0;
  let openCount = 0;
  const byKind = Object.fromEntries(
    Object.values(TransactionKind).map((kind) => [kind, 0n]),
  ) as Record<TransactionKind, bigint>;
  const days = new Map<string, DayAccumulator>();

  for (const row of rows) {
    const day = days.get(row.day) ?? {
      inflow: 0n,
      outflow: 0n,
      count: 0,
      hasOpen: false,
    };
    day.count += row.count;
    count += row.count;

    if (OPEN_STATUSES.has(row.status)) {
      day.hasOpen = true;
      openCount += row.count;
    }

    if (row.status === TransactionStatus.COMPLETED) {
      const amount = BigInt(row.amount);
      byKind[row.kind] += amount;
      if (row.direction === 'IN') {
        inflow += amount;
        day.inflow += amount;
      } else {
        outflow += amount;
        day.outflow += amount;
      }
    }

    days.set(row.day, day);
  }

  return {
    inflow: inflow.toString(),
    outflow: outflow.toString(),
    net: (inflow - outflow).toString(),
    count,
    openCount,
    byKind: Object.fromEntries(
      Object.entries(byKind).map(([kind, amount]) => [kind, amount.toString()]),
    ) as Record<TransactionKind, string>,
    byDay: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({
        date,
        inflow: day.inflow.toString(),
        outflow: day.outflow.toString(),
        net: (day.inflow - day.outflow).toString(),
        count: day.count,
        hasOpen: day.hasOpen,
      })),
  };
}
