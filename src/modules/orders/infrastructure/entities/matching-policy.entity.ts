import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';

/**
 * matching_policies — P2P 매칭/시간/분할 운영 정책.
 * 판매 주문 생성 시 min_split_ratio_bps를 스냅샷한다.
 */
@Entity({ name: 'matching_policies' })
export class MatchingPolicyEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'integer', name: 'min_split_ratio_bps' })
  minSplitRatioBps!: number;

  @Column({ type: 'integer', name: 'buyer_payment_timeout_seconds' })
  buyerPaymentTimeoutSeconds!: number;

  @Column({ type: 'integer', name: 'seller_confirmation_timeout_seconds' })
  sellerConfirmationTimeoutSeconds!: number;

  @Column({ type: 'integer', name: 'max_rematch_count', default: 3 })
  maxRematchCount!: number;

  /** Near 후보 허용 비율 (bps). 1000 = ±10% */
  @Column({ type: 'integer', name: 'near_match_max_ratio_bps', default: 1000 })
  nearMatchMaxRatioBps!: number;

  /** TradeRequest(PENDING_SELLER) TTL 초. 기본 180 */
  @Column({
    type: 'integer',
    name: 'trade_request_timeout_seconds',
    default: 180,
  })
  tradeRequestTimeoutSeconds!: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', name: 'effective_from' })
  effectiveFrom!: Date;

  @Column({ type: 'uuid', name: 'created_by_user_id', nullable: true })
  createdByUserId!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'reason', nullable: true })
  reason!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id', referencedColumnName: 'id' })
  createdByUser!: UserEntity | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
