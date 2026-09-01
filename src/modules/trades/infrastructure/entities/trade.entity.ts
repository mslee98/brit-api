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

import { TradeRequestEntity } from '../../../matching/infrastructure/entities/trade-request.entity';
import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { UserBankAccountEntity } from '../../../users/infrastructure/entities/user-bank-account.entity';
import { BuyOrderEntity } from '../../../orders/infrastructure/entities/buy-order.entity';
import { SellOrderEntity } from '../../../orders/infrastructure/entities/sell-order.entity';
import { TradeStatus } from '../../domain/enums/trade-status.enum';
import { TradeCoinLotEntity } from './trade-coin-lot.entity';
import { TradeEventEntity } from './trade-event.entity';

/**
 * trades — 매칭 성공 시 생성되는 P2P 거래.
 * 판매자 계좌·timeout은 생성 시점 Snapshot.
 * Accept 경로는 trade_request_id 로 Request와 1:1. 기존 /match Trade는 NULL.
 */
@Entity({ name: 'trades' })
@Index('ux_trades_trade_number', ['tradeNumber'], { unique: true })
@Index('ux_trades_buy_order_id', ['buyOrderId'], { unique: true })
@Index('ux_trades_trade_request_id', ['tradeRequestId'], {
  unique: true,
  where: '"trade_request_id" IS NOT NULL',
})
@Index('ix_trades_sell_order_id', ['sellOrderId'])
@Index('ix_trades_buyer_created', ['buyerUserId', 'createdAt'])
@Index('ix_trades_seller_created', ['sellerUserId', 'createdAt'])
@Index('ix_trades_status_due', ['status', 'buyerPaymentDueAt'])
@Index('ix_trades_status_seller_due', ['status', 'sellerConfirmationDueAt'])
@Check('ck_trades_coin_amount', '"coin_amount" > 0')
@Check('ck_trades_payment_amount', '"payment_amount" > 0')
@Check(
  'ck_trades_amounts_equal',
  '"coin_amount" = "payment_amount"',
)
export class TradeEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 40, name: 'trade_number' })
  tradeNumber!: string;

  @Column({ type: 'uuid', name: 'buy_order_id' })
  buyOrderId!: string;

  @ManyToOne(() => BuyOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buy_order_id', referencedColumnName: 'id' })
  buyOrder!: BuyOrderEntity;

  /** Accept 경로에서만 설정. 기존 /match Trade는 null */
  @Column({ type: 'uuid', name: 'trade_request_id', nullable: true })
  tradeRequestId!: string | null;

  @ManyToOne(() => TradeRequestEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'trade_request_id', referencedColumnName: 'id' })
  tradeRequest!: TradeRequestEntity | null;

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

  @Column({ type: 'uuid', name: 'seller_bank_account_id' })
  sellerBankAccountId!: string;

  @ManyToOne(() => UserBankAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_bank_account_id', referencedColumnName: 'id' })
  sellerBankAccount!: UserBankAccountEntity;

  @Column({ type: 'varchar', length: 20, name: 'seller_bank_code' })
  sellerBankCode!: string;

  @Column({ type: 'varchar', length: 100, name: 'seller_account_number' })
  sellerAccountNumber!: string;

  @Column({ type: 'varchar', length: 50, name: 'seller_account_holder_name' })
  sellerAccountHolderName!: string;

  @Column({ type: 'bigint', name: 'coin_amount' })
  coinAmount!: string;

  @Column({ type: 'bigint', name: 'payment_amount' })
  paymentAmount!: string;

  @Column({
    type: 'enum',
    enum: TradeStatus,
    enumName: 'trade_status',
    name: 'status',
  })
  status!: TradeStatus;

  @Column({ type: 'integer', name: 'buyer_payment_timeout_seconds' })
  buyerPaymentTimeoutSeconds!: number;

  @Column({ type: 'timestamptz', name: 'buyer_payment_due_at' })
  buyerPaymentDueAt!: Date;

  @Column({ type: 'integer', name: 'seller_confirmation_timeout_seconds' })
  sellerConfirmationTimeoutSeconds!: number;

  @Column({
    type: 'timestamptz',
    name: 'seller_confirmation_due_at',
    nullable: true,
  })
  sellerConfirmationDueAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'buyer_reported_paid_at',
    nullable: true,
  })
  buyerReportedPaidAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'seller_confirmed_at', nullable: true })
  sellerConfirmedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'coin_transfer_started_at',
    nullable: true,
  })
  coinTransferStartedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'coin_transferred_at', nullable: true })
  coinTransferredAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'cancellation_reason',
    nullable: true,
  })
  cancellationReason!: string | null;

  @OneToMany(() => TradeCoinLotEntity, (row) => row.trade)
  coinLots!: TradeCoinLotEntity[];

  @OneToMany(() => TradeEventEntity, (row) => row.trade)
  events!: TradeEventEntity[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
