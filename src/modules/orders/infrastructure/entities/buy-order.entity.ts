import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { BuyMatchType } from '../../domain/enums/buy-match-type.enum';
import { BuyOrderStatus } from '../../domain/enums/buy-order-status.enum';

/**
 * buy_orders — 구매 탐색 세션 (분할 불가, 사용자가 선택한 판매자와 체결).
 */
@Entity({ name: 'buy_orders' })
@Index('ux_buy_orders_order_number', ['orderNumber'], { unique: true })
@Index('ix_buy_orders_buyer_created', ['buyerUserId', 'createdAt'])
@Index('ux_buy_orders_buyer_idempotency', ['buyerUserId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Check('ck_buy_orders_coin_amount', '"coin_amount" > 0')
@Check('ck_buy_orders_rematch_count', '"rematch_count" >= 0')
@Check(
  'ck_buy_orders_matched_coin_amount',
  `"matched_coin_amount" IS NULL OR "matched_coin_amount" > 0`,
)
export class BuyOrderEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 40, name: 'order_number' })
  orderNumber!: string;

  @Column({ type: 'uuid', name: 'buyer_user_id' })
  buyerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_user_id', referencedColumnName: 'id' })
  buyerUser!: UserEntity;

  @Column({ type: 'bigint', name: 'coin_amount' })
  coinAmount!: string;

  /** 실제 매칭된 Coin (Near면 판매 remaining 전액) */
  @Column({
    type: 'bigint',
    name: 'matched_coin_amount',
    nullable: true,
  })
  matchedCoinAmount!: string | null;

  @Column({
    type: 'enum',
    enum: BuyMatchType,
    enumName: 'buy_match_type',
    name: 'match_type',
    nullable: true,
  })
  matchType!: BuyMatchType | null;

  @Column({
    type: 'enum',
    enum: BuyOrderStatus,
    enumName: 'buy_order_status',
    name: 'status',
  })
  status!: BuyOrderStatus;

  @Column({ type: 'integer', name: 'rematch_count', default: 0 })
  rematchCount!: number;

  @Column({ type: 'timestamptz', name: 'next_matchable_at', nullable: true })
  nextMatchableAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'idempotency_key',
    nullable: true,
  })
  idempotencyKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'matched_at', nullable: true })
  matchedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
