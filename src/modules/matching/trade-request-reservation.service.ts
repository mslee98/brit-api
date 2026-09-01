import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BuyOrderStatus } from '../orders/domain/enums/buy-order-status.enum';
import { deriveSellOrderStatus } from '../orders/utils/sell-order-status.util';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { TradeRequestEntity } from './infrastructure/entities/trade-request.entity';

/**
 * TradeRequest Soft-lock 해제.
 * Reject / Cancel / Expire가 동일하게 호출. Idempotent.
 * 전제: Request는 이미 종료 상태(REJECTED|CANCELLED_BY_BUYER|EXPIRED)로 저장된 뒤.
 */
@Injectable()
export class TradeRequestReservationService {
  async release(
    manager: EntityManager,
    request: TradeRequestEntity,
  ): Promise<void> {
    const amount = BigInt(request.requestedCoinAmount);
    const sellOrder = await manager.getRepository(SellOrderEntity).findOne({
      where: { id: request.sellOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!sellOrder) {
      return;
    }

    const reserved = BigInt(sellOrder.reservedCoinAmount);
    if (reserved >= amount) {
      const remaining = BigInt(sellOrder.remainingCoinAmount);
      const nextReserved = reserved - amount;
      const nextRemaining = remaining + amount;
      sellOrder.reservedCoinAmount = nextReserved.toString();
      sellOrder.remainingCoinAmount = nextRemaining.toString();
      sellOrder.status = deriveSellOrderStatus(nextRemaining, nextReserved);
      await manager.getRepository(SellOrderEntity).save(sellOrder);
    }

    const buyOrder = await manager.getRepository(BuyOrderEntity).findOne({
      where: { id: request.buyOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (buyOrder && buyOrder.status === BuyOrderStatus.REQUEST_PENDING) {
      buyOrder.status = BuyOrderStatus.MATCHING;
      await manager.getRepository(BuyOrderEntity).save(buyOrder);
    }
  }
}
