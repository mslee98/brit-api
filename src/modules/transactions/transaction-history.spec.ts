import { TransactionKind } from './domain/enums/transaction-kind.enum';
import {
  TransactionStatus,
  TransactionStatusFilter,
} from './domain/enums/transaction-status.enum';
import { TransactionTypeFilter } from './domain/enums/transaction-type-filter.enum';
import {
  buildTransactionWhere,
  decodeTransactionCursor,
  encodeTransactionCursor,
  isTransactionId,
  kstDayRange,
  kstMonthRange,
} from './domain/transaction-history.query';
import { summarizeTransactionRows } from './domain/transaction-summary';
import {
  buildTransactionTimeline,
  toTransactionDetail,
  type TransactionRow,
} from './transaction-history.service';

function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'trade-00000000-0000-0000-0000-000000000001',
    kind: TransactionKind.P2P_SELL,
    direction: 'OUT',
    status: TransactionStatus.COMPLETED,
    source_status: 'COMPLETED',
    coin_amount: '350000',
    cash_amount: '350000',
    point_amount: null,
    occurred_at: new Date('2026-11-06T13:23:00.000Z'),
    cursor_at: '2026-11-06T13:23:00.000000Z',
    requested_at: new Date('2026-11-06T13:10:00.000Z'),
    completed_at: new Date('2026-11-06T13:23:00.000Z'),
    reference_number: 'TO-20261106-000001',
    trade_id: '00000000-0000-0000-0000-000000000001',
    counterparty_user_id: 'buyer-1',
    counterparty_nickname: '테스트',
    partner_name: null,
    asset_name: null,
    exchange_rate_numerator: null,
    exchange_rate_denominator: null,
    bank_name: '국민은행',
    account_number: '12345678901',
    payment_reported_at: new Date('2026-11-06T13:15:00.000Z'),
    confirmed_at: new Date('2026-11-06T13:20:00.000Z'),
    ended_at: null,
    ...overrides,
  };
}

describe('transaction history query', () => {
  it('KST 월·일 경계를 UTC로 바꾼다', () => {
    expect(kstMonthRange('2026-12')).toEqual({
      from: new Date('2026-11-30T15:00:00.000Z'),
      to: new Date('2026-12-31T15:00:00.000Z'),
    });
    expect(kstDayRange('2026-11-07')).toEqual({
      from: new Date('2026-11-06T15:00:00.000Z'),
      to: new Date('2026-11-07T15:00:00.000Z'),
    });
  });

  it('구매 칩은 P2P 구매와 Brit 구매를, 처리 중은 확인 중을 함께 본다', () => {
    const { conditions, params } = buildTransactionWhere(
      {
        type: TransactionTypeFilter.BUY,
        statuses: [TransactionStatusFilter.PROCESSING],
      },
      2,
    );
    expect(conditions).toEqual(['tx.kind = ANY($2)', 'tx.status = ANY($3)']);
    expect(params).toEqual([
      [TransactionKind.P2P_BUY, TransactionKind.BRIT_PURCHASE],
      [TransactionStatus.PROCESSING, TransactionStatus.CHECKING],
    ]);
  });

  it('ALL과 빈 상태 목록은 조건을 만들지 않는다', () => {
    expect(
      buildTransactionWhere(
        { type: TransactionTypeFilter.ALL, statuses: [] },
        2,
      ),
    ).toEqual({ conditions: [], params: [] });
  });

  it('커서를 왕복하고 깨진 값은 거른다', () => {
    const cursor = {
      occurredAt: '2026-11-06T13:23:00.123456Z',
      id: 'trade-00000000-0000-0000-0000-000000000001',
    };
    expect(decodeTransactionCursor(encodeTransactionCursor(cursor))).toEqual(
      cursor,
    );
    expect(decodeTransactionCursor('not-a-cursor')).toBeNull();
    expect(
      decodeTransactionCursor(
        Buffer.from(JSON.stringify(['x', 'y'])).toString('base64url'),
      ),
    ).toBeNull();
  });

  it('출처 접두어가 있는 id만 받는다', () => {
    expect(
      isTransactionId('exchange-00000000-0000-0000-0000-000000000001'),
    ).toBe(true);
    expect(isTransactionId('00000000-0000-0000-0000-000000000001')).toBe(false);
    expect(isTransactionId("trade-1' OR 1=1")).toBe(false);
  });
});

describe('summarizeTransactionRows', () => {
  it('금액은 완료 건만, 건수는 모든 상태를 센다', () => {
    const summary = summarizeTransactionRows([
      {
        day: '2026-11-03',
        kind: TransactionKind.P2P_BUY,
        direction: 'IN',
        status: TransactionStatus.COMPLETED,
        amount: '600000',
        count: 1,
      },
      {
        day: '2026-11-03',
        kind: TransactionKind.P2P_SELL,
        direction: 'OUT',
        status: TransactionStatus.COMPLETED,
        amount: '850000',
        count: 2,
      },
      {
        day: '2026-11-05',
        kind: TransactionKind.PARTNER_CHARGE,
        direction: 'OUT',
        status: TransactionStatus.CHECKING,
        amount: '40000',
        count: 1,
      },
      {
        day: '2026-11-05',
        kind: TransactionKind.P2P_BUY,
        direction: 'IN',
        status: TransactionStatus.CANCELLED,
        amount: '80000',
        count: 1,
      },
    ]);

    expect(summary).toMatchObject({
      inflow: '600000',
      outflow: '850000',
      net: '-250000',
      count: 5,
      openCount: 1,
    });
    expect(summary.byKind[TransactionKind.P2P_SELL]).toBe('850000');
    expect(summary.byKind[TransactionKind.PARTNER_CHARGE]).toBe('0');
    expect(summary.byDay).toEqual([
      {
        date: '2026-11-03',
        inflow: '600000',
        outflow: '850000',
        net: '-250000',
        count: 3,
        hasOpen: false,
      },
      {
        date: '2026-11-05',
        inflow: '0',
        outflow: '0',
        net: '0',
        count: 2,
        hasOpen: true,
      },
    ]);
  });
});

describe('transaction detail mapping', () => {
  it('상대 닉네임과 계좌를 마스킹하고 진행 기록을 순서대로 만든다', () => {
    const detail = toTransactionDetail(row());
    expect(detail.counterpartyNickname).toBe('테**');
    expect(detail.accountNumberMasked).not.toContain('5678901');
    expect(detail.timeline.map((step) => step.step)).toEqual([
      'REQUESTED',
      'PAYMENT_REPORTED',
      'CONFIRMED',
      'COMPLETED',
    ]);
  });

  it('취소·실패는 끝난 시각으로 마지막 단계를 붙인다', () => {
    expect(
      buildTransactionTimeline(
        row({
          status: TransactionStatus.CANCELLED,
          completed_at: null,
          payment_reported_at: null,
          confirmed_at: null,
          ended_at: new Date('2026-11-06T13:12:00.000Z'),
        }),
      ).map((step) => step.step),
    ).toEqual(['REQUESTED', 'CANCELLED']);
  });

  it('업체 전환은 상대가 없고 조정은 완료 한 단계만 둔다', () => {
    const adjustment = toTransactionDetail(
      row({
        id: 'adjust-00000000-0000-0000-0000-000000000002',
        kind: TransactionKind.ADMIN_ADJUSTMENT,
        counterparty_user_id: null,
        counterparty_nickname: null,
        account_number: null,
      }),
    );
    expect(adjustment.counterpartyNickname).toBeNull();
    expect(adjustment.accountNumberMasked).toBeNull();
    expect(adjustment.timeline).toEqual([
      { step: 'COMPLETED', at: '2026-11-06T13:23:00.000Z' },
    ]);
  });
});
