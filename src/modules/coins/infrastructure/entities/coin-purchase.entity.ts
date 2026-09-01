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
import { CoinPurchaseStatus } from '../../domain/enums/coin-purchase-status.enum';

/**
 * coin_purchases — Brit Coin 구매(결제 확정 전/후).
 * P0: 관리자가 PENDING 생성 후 complete로 지급. 멱등 키는 id.
 */
@Entity({ name: 'coin_purchases' })
@Index('ix_coin_purchases_user_status', ['userId', 'status'])
@Check('ck_coin_purchases_amount_positive', '"amount" > 0')
export class CoinPurchaseEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'bigint', name: 'amount' })
  amount!: string;

  @Column({
    type: 'enum',
    enum: CoinPurchaseStatus,
    enumName: 'coin_purchase_status',
    name: 'status',
  })
  status!: CoinPurchaseStatus;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by_user_id', nullable: true })
  createdByUserId!: string | null;

  @Column({ type: 'uuid', name: 'completed_by_user_id', nullable: true })
  completedByUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
