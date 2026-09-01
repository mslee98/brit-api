import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { SellOrderStatus } from '../../domain/enums/sell-order-status.enum';
import { MatchingPolicyEntity } from './matching-policy.entity';
import { SellOrderCoinLotEntity } from './sell-order-coin-lot.entity';

/**
 * sell_orders — 판매 주문 (분할 가능, 생성 시 전액 Lot Lock).
 */
@Entity({ name: 'sell_orders' })
@Index('ux_sell_orders_order_number', ['orderNumber'], { unique: true })
@Index('ix_sell_orders_seller_created', ['sellerUserId', 'createdAt'])
@Index('ux_sell_orders_seller_idempotency', ['sellerUserId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Check('ck_sell_orders_original', '"original_coin_amount" > 0')
@Check('ck_sell_orders_amounts_non_negative', `
  "remaining_coin_amount" >= 0
  AND "reserved_coin_amount" >= 0
  AND "completed_coin_amount" >= 0
  AND "cancelled_coin_amount" >= 0
  AND "minimum_trade_amount" > 0
`)
@Check(
  'ck_sell_orders_amount_sum',
  `"original_coin_amount" = "remaining_coin_amount" + "reserved_coin_amount" + "completed_coin_amount" + "cancelled_coin_amount"`,
)
export class SellOrderEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 40, name: 'order_number' })
  orderNumber!: string;

  @Column({ type: 'uuid', name: 'seller_user_id' })
  sellerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_user_id', referencedColumnName: 'id' })
  sellerUser!: UserEntity;

  @Column({ type: 'uuid', name: 'matching_policy_id' })
  matchingPolicyId!: string;

  @ManyToOne(() => MatchingPolicyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'matching_policy_id', referencedColumnName: 'id' })
  matchingPolicy!: MatchingPolicyEntity;

  @Column({ type: 'bigint', name: 'original_coin_amount' })
  originalCoinAmount!: string;

  @Column({ type: 'bigint', name: 'remaining_coin_amount' })
  remainingCoinAmount!: string;

  @Column({ type: 'bigint', name: 'reserved_coin_amount', default: 0 })
  reservedCoinAmount!: string;

  @Column({ type: 'bigint', name: 'completed_coin_amount', default: 0 })
  completedCoinAmount!: string;

  @Column({ type: 'bigint', name: 'cancelled_coin_amount', default: 0 })
  cancelledCoinAmount!: string;

  @Column({ type: 'bigint', name: 'minimum_trade_amount' })
  minimumTradeAmount!: string;

  @Column({ type: 'integer', name: 'min_split_ratio_bps_snapshot' })
  minSplitRatioBpsSnapshot!: number;

  @Column({
    type: 'enum',
    enum: SellOrderStatus,
    enumName: 'sell_order_status',
    name: 'status',
  })
  status!: SellOrderStatus;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'idempotency_key',
    nullable: true,
  })
  idempotencyKey!: string | null;

  @OneToMany(() => SellOrderCoinLotEntity, (row) => row.sellOrder)
  coinLots!: SellOrderCoinLotEntity[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
