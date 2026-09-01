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
import { TradeEntity } from './trade.entity';

/**
 * trade_coin_lots — Trade에 배정된 Coin Lot (아직 이전 전 allocation).
 */
@Entity({ name: 'trade_coin_lots' })
@Check(
  'ck_trade_coin_lots_amounts',
  `"allocated_amount" >= 0 AND "transferred_amount" >= 0 AND "returned_amount" >= 0`,
)
@Check(
  'ck_trade_coin_lots_alloc',
  `"transferred_amount" + "returned_amount" <= "allocated_amount"`,
)
export class TradeCoinLotEntity {
  @PrimaryColumn({ type: 'uuid', name: 'trade_id' })
  tradeId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'coin_lot_id' })
  coinLotId!: string;

  @ManyToOne(() => TradeEntity, (trade) => trade.coinLots, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'trade_id', referencedColumnName: 'id' })
  trade!: TradeEntity;

  @ManyToOne(() => UserCoinLotEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coin_lot_id', referencedColumnName: 'id' })
  coinLot!: UserCoinLotEntity;

  @Column({ type: 'bigint', name: 'allocated_amount' })
  allocatedAmount!: string;

  @Column({ type: 'bigint', name: 'transferred_amount', default: 0 })
  transferredAmount!: string;

  @Column({ type: 'bigint', name: 'returned_amount', default: 0 })
  returnedAmount!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
