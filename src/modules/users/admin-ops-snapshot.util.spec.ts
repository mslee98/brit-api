import { TradeDisputeStatus } from '../trades/domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../trades/domain/enums/trade-status.enum';
import {
  summarizeAdminDisputeRows,
  summarizeAdminTradeRows,
} from './admin-ops-snapshot.util';

describe('admin ops-snapshot 집계', () => {
  it('CANCELLED만 취소 거래로 세고 DISPUTED는 진행에 넣지 않는다', () => {
    const summary = summarizeAdminTradeRows([
      { status: TradeStatus.COMPLETED, count: '10', paymentSum: '0' },
      { status: TradeStatus.CANCELLED, count: '2', paymentSum: '0' },
      { status: TradeStatus.DISPUTED, count: '1', paymentSum: '50000' },
      {
        status: TradeStatus.WAITING_BUYER_PAYMENT,
        count: '3',
        paymentSum: '30000',
      },
    ]);
    expect(summary.completedTrades).toBe(10);
    expect(summary.cancelledTrades).toBe(2);
    expect(summary.ongoingTrades).toBe(3);
    expect(summary.lifetimeTrades).toBe(16);
    expect(summary.ongoingPayment).toBe(30000n);
  });

  it('열린 분쟁만 진행 분쟁으로 센다', () => {
    const summary = summarizeAdminDisputeRows([
      { status: TradeDisputeStatus.OPEN_UNASSIGNED, count: '1' },
      { status: TradeDisputeStatus.IN_REVIEW, count: '2' },
      { status: TradeDisputeStatus.RESOLVED, count: '4' },
      { status: TradeDisputeStatus.CANCELLED, count: '1' },
    ]);
    expect(summary.ongoingDisputes).toBe(3);
    expect(summary.lifetimeDisputes).toBe(8);
  });
});
