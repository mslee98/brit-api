import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserCoinLotEntity } from '../../../coins/infrastructure/entities/user-coin-lot.entity';
import { SellOrderEntity } from './sell-order.entity';

/**
 * sell_order_coin_lots — 판매 주문과 Lot 잠금 관계.
 */
@Entity({ name: 'sell_order_coin_lots' })
@Check(
  'ck_sell_order_coin_lots_amounts',
  `"locked_amount" >= 0 AND "consumed_amount" >= 0 AND "released_amount" >= 0`,
)
@Check(
  'ck_sell_order_coin_lots_alloc',
  `"consumed_amount" + "released_amount" <= "locked_amount"`,
)
export class SellOrderCoinLotEntity {
  @PrimaryColumn({ type: 'uuid', name: 'sell_order_id' })
  sellOrderId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'coin_lot_id' })
  coinLotId!: string;

  @ManyToOne(() => SellOrderEntity, (order) => order.coinLots, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sell_order_id', referencedColumnName: 'id' })
  sellOrder!: SellOrderEntity;

  @ManyToOne(() => UserCoinLotEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coin_lot_id', referencedColumnName: 'id' })
  coinLot!: UserCoinLotEntity;

  @Column({ type: 'bigint', name: 'locked_amount' })
  lockedAmount!: string;

  @Column({ type: 'bigint', name: 'consumed_amount', default: 0 })
  consumedAmount!: string;

  @Column({ type: 'bigint', name: 'released_amount', default: 0 })
  releasedAmount!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
