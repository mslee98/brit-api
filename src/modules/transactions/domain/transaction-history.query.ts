import { TransactionKind } from './enums/transaction-kind.enum';
import {
  TransactionStatus,
  TransactionStatusFilter,
} from './enums/transaction-status.enum';
import { TransactionTypeFilter } from './enums/transaction-type-filter.enum';

/**
 * 통합 거래내역 SQL.
 * 원장(coin_ledger_entries)에는 끝난 Coin 이동만 있어서, 진행 중·취소 건까지 보이려면
 * 원본 테이블(trades·coin_purchases·partner_exchanges)을 합친다. 관리자 조정만 원장에서 읽는다.
 *
 * occurred_at = 끝난 시각(완료·취소·실패), 진행 중이면 시작 시각.
 * 진행 중이던 건은 끝나는 순간 끝난 날짜로 옮겨 간다.
 *
 * `$1` = 사용자 id. 다른 파라미터는 `$2`부터 쓴다.
 */
export const TRANSACTION_UNION_SQL = `
  SELECT
    'trade-' || t.id::text AS id,
    '${TransactionKind.P2P_BUY}' AS kind,
    'IN' AS direction,
    CASE t.status::text
      WHEN 'COMPLETED' THEN '${TransactionStatus.COMPLETED}'
      WHEN 'DISPUTED' THEN '${TransactionStatus.CHECKING}'
      WHEN 'CANCELLED' THEN '${TransactionStatus.CANCELLED}'
      WHEN 'PAYMENT_TIMEOUT' THEN '${TransactionStatus.CANCELLED}'
      ELSE '${TransactionStatus.PROCESSING}'
    END AS status,
    t.status::text AS source_status,
    t.coin_amount AS coin_amount,
    t.payment_amount AS cash_amount,
    NULL::bigint AS point_amount,
    COALESCE(t.completed_at, t.cancelled_at, t.created_at) AS occurred_at,
    t.created_at AS requested_at,
    t.completed_at AS completed_at,
    t.trade_number AS reference_number,
    t.id AS trade_id,
    t.seller_user_id AS counterparty_user_id,
    NULL::uuid AS partner_asset_id,
    t.seller_bank_code AS bank_code,
    t.seller_account_number AS account_number,
    t.buyer_reported_paid_at AS payment_reported_at,
    t.seller_confirmed_at AS confirmed_at,
    t.cancelled_at AS ended_at
  FROM trades t
  WHERE t.buyer_user_id = $1

  UNION ALL

  SELECT
    'trade-' || t.id::text,
    '${TransactionKind.P2P_SELL}',
    'OUT',
    CASE t.status::text
      WHEN 'COMPLETED' THEN '${TransactionStatus.COMPLETED}'
      WHEN 'DISPUTED' THEN '${TransactionStatus.CHECKING}'
      WHEN 'CANCELLED' THEN '${TransactionStatus.CANCELLED}'
      WHEN 'PAYMENT_TIMEOUT' THEN '${TransactionStatus.CANCELLED}'
      ELSE '${TransactionStatus.PROCESSING}'
    END,
    t.status::text,
    t.coin_amount,
    t.payment_amount,
    NULL::bigint,
    COALESCE(t.completed_at, t.cancelled_at, t.created_at),
    t.created_at,
    t.completed_at,
    t.trade_number,
    t.id,
    t.buyer_user_id,
    NULL::uuid,
    t.seller_bank_code,
    t.seller_account_number,
    t.buyer_reported_paid_at,
    t.seller_confirmed_at,
    t.cancelled_at
  FROM trades t
  WHERE t.seller_user_id = $1

  UNION ALL

  SELECT
    'purchase-' || cp.id::text,
    '${TransactionKind.BRIT_PURCHASE}',
    'IN',
    CASE cp.status::text
      WHEN 'COMPLETED' THEN '${TransactionStatus.COMPLETED}'
      WHEN 'CANCELLED' THEN '${TransactionStatus.CANCELLED}'
      ELSE '${TransactionStatus.PROCESSING}'
    END,
    cp.status::text,
    cp.amount,
    NULL::bigint,
    NULL::bigint,
    COALESCE(
      cp.completed_at,
      CASE WHEN cp.status::text = 'CANCELLED' THEN cp.updated_at END,
      cp.created_at
    ),
    cp.created_at,
    cp.completed_at,
    NULL::varchar,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::varchar,
    NULL::varchar,
    NULL::timestamptz,
    NULL::timestamptz,
    CASE WHEN cp.status::text = 'CANCELLED' THEN cp.updated_at END
  FROM coin_purchases cp
  WHERE cp.user_id = $1

  UNION ALL

  SELECT
    'exchange-' || pe.id::text,
    CASE pe.exchange_type
      WHEN 'CHARGE' THEN '${TransactionKind.PARTNER_CHARGE}'
      ELSE '${TransactionKind.PARTNER_REDEEM}'
    END,
    CASE pe.exchange_type WHEN 'CHARGE' THEN 'OUT' ELSE 'IN' END,
    CASE pe.status
      WHEN 'COMPLETED' THEN '${TransactionStatus.COMPLETED}'
      WHEN 'FAILED_CONFIRMED' THEN '${TransactionStatus.FAILED}'
      WHEN 'RECONCILIATION_REQUIRED' THEN '${TransactionStatus.CHECKING}'
      ELSE '${TransactionStatus.PROCESSING}'
    END,
    pe.status,
    pe.amount,
    NULL::bigint,
    pe.amount,
    COALESCE(pe.completed_at, pe.failed_at, pe.requested_at),
    pe.requested_at,
    pe.completed_at,
    pe.exchange_number,
    NULL::uuid,
    NULL::uuid,
    pe.partner_asset_id,
    NULL::varchar,
    NULL::varchar,
    NULL::timestamptz,
    NULL::timestamptz,
    pe.failed_at
  FROM partner_exchanges pe
  WHERE pe.user_id = $1

  UNION ALL

  SELECT
    'adjust-' || l.id::text,
    '${TransactionKind.ADMIN_ADJUSTMENT}',
    CASE WHEN l.non_sellable_delta + l.sellable_delta >= 0 THEN 'IN' ELSE 'OUT' END,
    '${TransactionStatus.COMPLETED}',
    l.entry_type::text,
    ABS(l.non_sellable_delta + l.sellable_delta),
    NULL::bigint,
    NULL::bigint,
    l.created_at,
    l.created_at,
    l.created_at,
    NULL::varchar,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::varchar,
    NULL::varchar,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz
  FROM coin_ledger_entries l
  WHERE l.user_id = $1
    AND l.entry_type::text IN ('ADMIN_CREDIT', 'ADMIN_DEBIT')
`;

export const TYPE_FILTER_KINDS: Record<
  Exclude<TransactionTypeFilter, TransactionTypeFilter.ALL>,
  TransactionKind[]
> = {
  [TransactionTypeFilter.BUY]: [
    TransactionKind.P2P_BUY,
    TransactionKind.BRIT_PURCHASE,
  ],
  [TransactionTypeFilter.SELL]: [TransactionKind.P2P_SELL],
  [TransactionTypeFilter.CHARGE]: [TransactionKind.PARTNER_CHARGE],
  [TransactionTypeFilter.REDEEM]: [TransactionKind.PARTNER_REDEEM],
  [TransactionTypeFilter.ADJUSTMENT]: [TransactionKind.ADMIN_ADJUSTMENT],
};

export const STATUS_FILTER_STATUSES: Record<
  TransactionStatusFilter,
  TransactionStatus[]
> = {
  [TransactionStatusFilter.COMPLETED]: [TransactionStatus.COMPLETED],
  [TransactionStatusFilter.PROCESSING]: [
    TransactionStatus.PROCESSING,
    TransactionStatus.CHECKING,
  ],
  [TransactionStatusFilter.CANCELLED]: [TransactionStatus.CANCELLED],
  [TransactionStatusFilter.FAILED]: [TransactionStatus.FAILED],
};

export type TransactionHistoryFilter = {
  /** KST 기준 [from, to) */
  range?: { from: Date; to: Date };
  type?: TransactionTypeFilter;
  statuses?: TransactionStatusFilter[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM` → KST 월 [시작, 다음 달 시작) */
export function kstMonthRange(month: string): { from: Date; to: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    from: new Date(`${month}-01T00:00:00+09:00`),
    to: new Date(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+09:00`,
    ),
  };
}

/** `YYYY-MM-DD` → KST 하루 [시작, 다음 날 시작) */
export function kstDayRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00+09:00`);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

/**
 * tx CTE 바깥 WHERE 절. 파라미터 번호는 `firstIndex`부터 매긴다.
 */
export function buildTransactionWhere(
  filter: TransactionHistoryFilter,
  firstIndex: number,
): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const next = (value: unknown) => {
    params.push(value);
    return `$${firstIndex + params.length - 1}`;
  };

  if (filter.range) {
    conditions.push(`tx.occurred_at >= ${next(filter.range.from)}`);
    conditions.push(`tx.occurred_at < ${next(filter.range.to)}`);
  }

  if (filter.type && filter.type !== TransactionTypeFilter.ALL) {
    conditions.push(`tx.kind = ANY(${next(TYPE_FILTER_KINDS[filter.type])})`);
  }

  if (filter.statuses && filter.statuses.length > 0) {
    const statuses = filter.statuses.flatMap(
      (status) => STATUS_FILTER_STATUSES[status],
    );
    conditions.push(`tx.status = ANY(${next(statuses)})`);
  }

  return { conditions, params };
}

export type TransactionCursor = { occurredAt: string; id: string };

export function encodeTransactionCursor(cursor: TransactionCursor): string {
  return Buffer.from(JSON.stringify([cursor.occurredAt, cursor.id])).toString(
    'base64url',
  );
}

export function decodeTransactionCursor(
  value: string,
): TransactionCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      !Number.isNaN(Date.parse(parsed[0]))
    ) {
      return { occurredAt: parsed[0], id: parsed[1] };
    }
  } catch {
    return null;
  }
  return null;
}

/** `trade-<uuid>` 형식만 받는다. */
export function isTransactionId(value: string): boolean {
  return /^(trade|purchase|exchange|adjust)-[0-9a-f-]{36}$/i.test(value);
}
