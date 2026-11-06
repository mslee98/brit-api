import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { maskAccountNumber } from '../../common/utils/account-crypto.util';
import { maskNickname } from '../users/utils/nickname-mask.util';
import { TransactionKind } from './domain/enums/transaction-kind.enum';
import { TransactionStatus } from './domain/enums/transaction-status.enum';
import {
  TRANSACTION_UNION_SQL,
  buildTransactionWhere,
  decodeTransactionCursor,
  encodeTransactionCursor,
  isTransactionId,
  kstDayRange,
  kstMonthRange,
  type TransactionHistoryFilter,
} from './domain/transaction-history.query';
import {
  summarizeTransactionRows,
  type TransactionSummaryRow,
} from './domain/transaction-summary';
import {
  SearchTransactionDto,
  TransactionSummaryQueryDto,
} from './dto/search-transaction.dto';
import {
  TransactionDetailDto,
  TransactionItemDto,
  TransactionListResponseDto,
  TransactionSummaryResponseDto,
  TransactionTimelineStepDto,
} from './dto/transaction-response.dto';
import { TransactionDomainException } from './exceptions/transaction.exceptions';

export type TransactionRow = {
  id: string;
  kind: TransactionKind;
  direction: 'IN' | 'OUT';
  status: TransactionStatus;
  source_status: string;
  coin_amount: string;
  cash_amount: string | null;
  point_amount: string | null;
  occurred_at: Date;
  cursor_at: string;
  requested_at: Date;
  completed_at: Date | null;
  reference_number: string | null;
  trade_id: string | null;
  counterparty_user_id: string | null;
  counterparty_nickname: string | null;
  partner_name: string | null;
  asset_name: string | null;
  exchange_rate_numerator: string | null;
  exchange_rate_denominator: string | null;
  bank_name: string | null;
  account_number: string | null;
  payment_reported_at: Date | null;
  confirmed_at: Date | null;
  ended_at: Date | null;
};

const SELECT_WITH_JOINS = `
  WITH tx AS (${TRANSACTION_UNION_SQL})
  SELECT
    tx.*,
    to_char(tx.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
    up.nickname AS counterparty_nickname,
    pt.name AS partner_name,
    pa.asset_name AS asset_name,
    pa.exchange_rate_numerator::text AS exchange_rate_numerator,
    pa.exchange_rate_denominator::text AS exchange_rate_denominator,
    b.name AS bank_name
  FROM tx
  LEFT JOIN user_profiles up ON up.user_id = tx.counterparty_user_id
  LEFT JOIN partner_assets pa ON pa.id = tx.partner_asset_id
  LEFT JOIN partners pt ON pt.id = pa.partner_id
  LEFT JOIN banks b ON b.code = tx.bank_code
`;

/**
 * 통합 거래내역 조회 (read-only).
 * trades·coin_purchases·partner_exchanges·coin_ledger_entries를 직접 읽는다.
 * 쓰기는 하지 않으며 각 모듈 서비스를 거치지 않는 예외는 p0-transactions 문서에 적어 둔다.
 */
@Injectable()
export class TransactionHistoryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    userId: string,
    query: SearchTransactionDto,
  ): Promise<TransactionListResponseDto> {
    const size = query.size ?? 30;
    const filter: TransactionHistoryFilter = {
      range: query.date
        ? kstDayRange(query.date)
        : query.month
          ? kstMonthRange(query.month)
          : undefined,
      type: query.type,
      statuses: query.status,
    };
    const { conditions, params } = buildTransactionWhere(filter, 2);

    if (query.cursor) {
      const cursor = decodeTransactionCursor(query.cursor);
      if (!cursor) throw TransactionDomainException.invalidCursor();
      params.push(cursor.occurredAt, cursor.id);
      // $1은 userId라 params[i]는 $(i + 2)
      conditions.push(
        `(tx.occurred_at, tx.id) < ($${params.length}::timestamptz, $${params.length + 1})`,
      );
    }

    params.push(size + 1);
    const sql = `${SELECT_WITH_JOINS}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY tx.occurred_at DESC, tx.id DESC
      LIMIT $${params.length + 1}`;

    const rows: TransactionRow[] = await this.dataSource.query(sql, [
      userId,
      ...params,
    ]);
    const page = rows.slice(0, size);
    const last = page[page.length - 1];

    return {
      items: page.map((row) => toTransactionItem(row)),
      nextCursor:
        rows.length > size && last
          ? encodeTransactionCursor({ occurredAt: last.cursor_at, id: last.id })
          : null,
    };
  }

  async summary(
    userId: string,
    query: TransactionSummaryQueryDto,
  ): Promise<TransactionSummaryResponseDto> {
    const { conditions, params } = buildTransactionWhere(
      {
        range: kstMonthRange(query.month),
        type: query.type,
        statuses: query.status,
      },
      2,
    );
    const rows: TransactionSummaryRow[] = await this.dataSource.query(
      `WITH tx AS (${TRANSACTION_UNION_SQL})
      SELECT
        to_char(tx.occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day,
        tx.kind,
        tx.direction,
        tx.status,
        SUM(tx.coin_amount)::text AS amount,
        COUNT(*)::int AS count
      FROM tx
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1, 2, 3, 4`,
      [userId, ...params],
    );

    return { month: query.month, ...summarizeTransactionRows(rows) };
  }

  async detail(
    userId: string,
    transactionId: string,
  ): Promise<TransactionDetailDto> {
    if (!isTransactionId(transactionId)) {
      throw TransactionDomainException.notFound();
    }
    const rows: TransactionRow[] = await this.dataSource.query(
      `${SELECT_WITH_JOINS} WHERE tx.id = $2 LIMIT 1`,
      [userId, transactionId],
    );
    const row = rows[0];
    if (!row) throw TransactionDomainException.notFound();
    return toTransactionDetail(row);
  }
}

function iso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function toTransactionItem(row: TransactionRow): TransactionItemDto {
  return {
    id: row.id,
    kind: row.kind,
    direction: row.direction,
    status: row.status,
    coinAmount: row.coin_amount,
    cashAmount: row.cash_amount,
    pointAmount: row.point_amount,
    occurredAt: iso(row.occurred_at)!,
    requestedAt: iso(row.requested_at)!,
    completedAt: iso(row.completed_at),
    referenceNumber: row.reference_number,
    tradeId: row.trade_id,
    counterpartyNickname: row.counterparty_user_id
      ? maskNickname(row.counterparty_nickname)
      : null,
    partnerName: row.partner_name,
    assetName: row.asset_name,
  };
}

export function buildTransactionTimeline(
  row: TransactionRow,
): TransactionTimelineStepDto[] {
  if (row.kind === TransactionKind.ADMIN_ADJUSTMENT) {
    return [{ step: 'COMPLETED', at: iso(row.occurred_at)! }];
  }

  const steps: TransactionTimelineStepDto[] = [
    { step: 'REQUESTED', at: iso(row.requested_at)! },
  ];
  if (row.payment_reported_at) {
    steps.push({ step: 'PAYMENT_REPORTED', at: iso(row.payment_reported_at)! });
  }
  if (row.confirmed_at) {
    steps.push({ step: 'CONFIRMED', at: iso(row.confirmed_at)! });
  }
  if (row.completed_at) {
    steps.push({ step: 'COMPLETED', at: iso(row.completed_at)! });
  } else if (row.status === TransactionStatus.CANCELLED && row.ended_at) {
    steps.push({ step: 'CANCELLED', at: iso(row.ended_at)! });
  } else if (row.status === TransactionStatus.FAILED && row.ended_at) {
    steps.push({ step: 'FAILED', at: iso(row.ended_at)! });
  }
  return steps;
}

export function toTransactionDetail(row: TransactionRow): TransactionDetailDto {
  return {
    ...toTransactionItem(row),
    bankName: row.bank_name,
    accountNumberMasked: row.account_number
      ? maskAccountNumber(row.account_number)
      : null,
    exchangeRate:
      row.exchange_rate_numerator && row.exchange_rate_denominator
        ? {
            numerator: row.exchange_rate_numerator,
            denominator: row.exchange_rate_denominator,
          }
        : null,
    timeline: buildTransactionTimeline(row),
  };
}
