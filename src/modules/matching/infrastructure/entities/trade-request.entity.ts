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

import { BuyMatchType } from '../../../orders/domain/enums/buy-match-type.enum';
import { BuyOrderEntity } from '../../../orders/infrastructure/entities/buy-order.entity';
import { SellOrderEntity } from '../../../orders/infrastructure/entities/sell-order.entity';
import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { TradeRequestRejectionReason } from '../../domain/enums/trade-request-rejection-reason.enum';
import { TradeRequestStatus } from '../../domain/enums/trade-request-status.enum';

/**
 * trade_requests — 구매자 Apply → 판매자 Accept 전 신청 업무 객체.
 * Trade 관계는 trades.trade_request_id 가 SoT (양방향 FK 없음).
 */
@Entity({ name: 'trade_requests' })
@Index('uq_trade_request_pending_buy', ['buyOrderId'], {
  unique: true,
  where: `"status" = 'PENDING_SELLER'`,
})
@Index('uq_trade_request_pending_sell', ['sellOrderId'], {
  unique: true,
  where: `"status" = 'PENDING_SELLER'`,
})
@Index('ux_trade_requests_buyer_idempotency', ['buyerUserId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Index('ix_trade_requests_sell_status', ['sellOrderId', 'status'])
@Index('ix_trade_requests_expires', ['expiresAt'], {
  where: `"status" = 'PENDING_SELLER'`,
})
@Check('ck_trade_requests_requested_coin_amount', '"requested_coin_amount" > 0')
export class TradeRequestEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'buy_order_id' })
  buyOrderId!: string;

  @ManyToOne(() => BuyOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buy_order_id', referencedColumnName: 'id' })
  buyOrder!: BuyOrderEntity;

  @Column({ type: 'uuid', name: 'sell_order_id' })
  sellOrderId!: string;

  @ManyToOne(() => SellOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sell_order_id', referencedColumnName: 'id' })
  sellOrder!: SellOrderEntity;

  @Column({ type: 'uuid', name: 'buyer_user_id' })
  buyerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_user_id', referencedColumnName: 'id' })
  buyerUser!: UserEntity;

  @Column({ type: 'uuid', name: 'seller_user_id' })
  sellerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_user_id', referencedColumnName: 'id' })
  sellerUser!: UserEntity;

  @Column({ type: 'bigint', name: 'requested_coin_amount' })
  requestedCoinAmount!: string;

  @Column({
    type: 'enum',
    enum: BuyMatchType,
    enumName: 'buy_match_type',
    name: 'match_type',
  })
  matchType!: BuyMatchType;

  @Column({
    type: 'enum',
    enum: TradeRequestStatus,
    enumName: 'trade_request_status',
    name: 'status',
  })
  status!: TradeRequestStatus;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({
    type: 'enum',
    enum: TradeRequestRejectionReason,
    enumName: 'trade_request_rejection_reason',
    name: 'rejection_reason_code',
    nullable: true,
  })
  rejectionReasonCode!: TradeRequestRejectionReason | null;

  @Column({ type: 'timestamptz', name: 'accepted_at', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'rejected_at', nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'expired_at', nullable: true })
  expiredAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'idempotency_key',
    nullable: true,
  })
  idempotencyKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
