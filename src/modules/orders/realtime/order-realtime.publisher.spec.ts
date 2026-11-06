import type { Server } from 'socket.io';
import type { Repository } from 'typeorm';

import type { TradeRequestEntity } from '../../matching/infrastructure/entities/trade-request.entity';
import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';
import type { BuyOrderEntity } from '../infrastructure/entities/buy-order.entity';
import type { MatchingPolicyEntity } from '../infrastructure/entities/matching-policy.entity';
import type { SellOrderEntity } from '../infrastructure/entities/sell-order.entity';
import { ORDER_WS_EVENTS } from './order-realtime.constants';
import { OrderRealtimePublisher } from './order-realtime.publisher';

const flush = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('OrderRealtimePublisher matching.changed', () => {
  let sell: {
    id: string;
    status: SellOrderStatus;
    remainingCoinAmount: string;
    cancelledAt: Date | null;
  };
  let buyOrderIds: string[];
  let emitted: Array<{ room: string; event: string; payload: unknown }>;
  let buyQuery: jest.Mock<Promise<Array<{ id: string }>>, [string, unknown[]]>;
  let publisher: OrderRealtimePublisher;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    sell = {
      id: 'sell-1',
      status: SellOrderStatus.OPEN,
      remainingCoinAmount: '100000',
      cancelledAt: null,
    };
    buyOrderIds = ['buy-1'];
    emitted = [];
    buyQuery = jest.fn<Promise<Array<{ id: string }>>, [string, unknown[]]>(
      () => Promise.resolve(buyOrderIds.map((id) => ({ id }))),
    );

    publisher = new OrderRealtimePublisher(
      { query: buyQuery } as unknown as Repository<BuyOrderEntity>,
      {
        findOne: jest.fn(() => Promise.resolve({ ...sell })),
      } as unknown as Repository<SellOrderEntity>,
      {} as Repository<TradeRequestEntity>,
      {
        findOne: jest.fn(() =>
          Promise.resolve({ id: 'p', nearMatchMaxRatioBps: 1000 }),
        ),
      } as unknown as Repository<MatchingPolicyEntity>,
    );
    publisher.attach({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
    } as unknown as Server);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('첫 신호는 바로, 바뀐 판매 잔량을 담아 보낸다', async () => {
    publisher.publishMatchingChanged('sell-1', []);
    await flush();

    expect(emitted).toEqual([
      {
        room: 'buy-order:buy-1',
        event: ORDER_WS_EVENTS.MATCHING_CHANGED,
        payload: {
          buyOrderId: 'buy-1',
          changes: [{ sellOrderId: 'sell-1', remaining: '100000' }],
        },
      },
    ]);
    // 100000 ±10% NEAR 범위의 구매만 조회
    expect(buyQuery.mock.calls[0][1]).toEqual(['MATCHING', '90910', '111111']);
  });

  it('창 안의 신호는 합쳐서 판매별 마지막 잔량만 보낸다', async () => {
    publisher.publishMatchingChanged('sell-1', []);
    await flush();

    sell.remainingCoinAmount = '0';
    sell.status = SellOrderStatus.FULLY_RESERVED;
    publisher.publishMatchingChanged('sell-1', ['100000']);
    await flush();
    sell.remainingCoinAmount = '100000';
    sell.status = SellOrderStatus.OPEN;
    publisher.publishMatchingChanged('sell-1', ['0']);
    await flush();
    expect(emitted).toHaveLength(1);

    jest.advanceTimersByTime(300);
    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload).toEqual({
      buyOrderId: 'buy-1',
      changes: [{ sellOrderId: 'sell-1', remaining: '100000' }],
    });
  });

  it('취소된 판매는 잔량 0으로 보내고 이전 잔량 기준으로 대상을 찾는다', async () => {
    sell.status = SellOrderStatus.CANCELLED;
    sell.remainingCoinAmount = '0';
    sell.cancelledAt = new Date();
    publisher.publishMatchingChanged('sell-1', ['50000']);
    await flush();

    expect(buyQuery.mock.calls[0][1]).toEqual(['MATCHING', '45455', '55555']);
    expect(emitted[0].payload).toEqual({
      buyOrderId: 'buy-1',
      changes: [{ sellOrderId: 'sell-1', remaining: '0' }],
    });
  });
});
