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
import { CoinLotStatus } from '../../domain/enums/coin-lot-status.enum';
import { CoinSourceType } from '../../domain/enums/coin-source-type.enum';

/**
 * user_coin_lots — Coin 출처·판매가능성·잔량.
 * original = remaining + locked + consumed (CHECK).
 */
@Entity({ name: 'user_coin_lots' })
@Index('ix_user_coin_lots_user_available', [
  'userId',
  'isSellable',
  'status',
  'availableAt',
])
@Check(
  'ck_user_coin_lots_amounts_non_negative',
  '"original_amount" >= 0 AND "remaining_amount" >= 0 AND "locked_amount" >= 0 AND "consumed_amount" >= 0',
)
@Check(
  'ck_user_coin_lots_amount_sum',
  '"original_amount" = "remaining_amount" + "locked_amount" + "consumed_amount"',
)
export class UserCoinLotEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({
    type: 'enum',
    enum: CoinSourceType,
    enumName: 'coin_source_type',
    name: 'source_type',
  })
  sourceType!: CoinSourceType;

  @Column({ type: 'uuid', name: 'source_id', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'bigint', name: 'original_amount' })
  originalAmount!: string;

  @Column({ type: 'bigint', name: 'remaining_amount' })
  remainingAmount!: string;

  @Column({ type: 'bigint', name: 'locked_amount', default: 0 })
  lockedAmount!: string;

  @Column({ type: 'bigint', name: 'consumed_amount', default: 0 })
  consumedAmount!: string;

  @Column({ type: 'boolean', name: 'is_sellable' })
  isSellable!: boolean;

  @Column({
    type: 'enum',
    enum: CoinLotStatus,
    enumName: 'coin_lot_status',
    name: 'status',
  })
  status!: CoinLotStatus;

  @Column({ type: 'timestamptz', name: 'available_at' })
  availableAt!: Date;

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
