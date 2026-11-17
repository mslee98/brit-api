import {
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
import { PartnerPaymentIntentStatus } from '../../domain/enums/partner-payment-intent-status.enum';
import { PartnerClientEntity } from './partner-client.entity';
import { PartnerExchangeEntity } from './partner-exchange.entity';
import { PartnerEntity } from './partner.entity';

/**
 * partner_payment_intents — 업체 CHARGE 일회성 Intent.
 * 실제 원장은 partner_exchanges. Embed PIN 후 B4-1 잠금(PAYMENT_PROCESSING).
 */
@Entity({ name: 'partner_payment_intents' })
@Index('ux_partner_payment_intents_external_order', ['partnerId', 'externalOrderId'], {
  unique: true,
})
@Index('ix_partner_payment_intents_partner_created', ['partnerId', 'createdAt'])
@Index('ix_partner_payment_intents_status_expires', ['status', 'expiresAt'])
export class PartnerPaymentIntentEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'uuid', name: 'partner_client_id' })
  partnerClientId!: string;

  @ManyToOne(() => PartnerClientEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity;

  /** 업체 주문/멱등 키 (partner 내 unique) */
  @Column({ type: 'varchar', length: 100, name: 'external_order_id' })
  externalOrderId!: string;

  @Column({ type: 'varchar', length: 255, name: 'partner_user_key' })
  partnerUserKey!: string;

  /**
   * CHARGE 금액 (MS, 양의 정수 문자열).
   * create 시 생략 가능 — Embed lock 후 확정 (D26).
   */
  @Column({ type: 'bigint', name: 'amount', nullable: true })
  amount!: string | null;

  /** 수수료 스냅샷 (표시·감사). 사용자 MS 차감은 amount. lock 전 null */
  @Column({ type: 'bigint', name: 'fee_amount', nullable: true })
  feeAmount!: string | null;

  /** 수수료 정책 스냅샷 (B4-3 settle 시 재조회 대신 사용) */
  @Column({ type: 'uuid', name: 'fee_policy_id', nullable: true })
  feePolicyId!: string | null;

  @Column({ type: 'bigint', name: 'total_debit', nullable: true })
  totalDebit!: string | null;

  /** create(amount) 또는 Embed lock 시점. null이면 금액 미확정 */
  @Column({ type: 'timestamptz', name: 'amount_locked_at', nullable: true })
  amountLockedAt!: Date | null;

  @Column({ type: 'varchar', length: 30, name: 'asset_code', nullable: true })
  assetCode!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'return_origin' })
  returnOrigin!: string;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'status',
    default: PartnerPaymentIntentStatus.CREATED,
  })
  status!: PartnerPaymentIntentStatus;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'uuid', name: 'authorized_user_id', nullable: true })
  authorizedUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'authorized_user_id', referencedColumnName: 'id' })
  authorizedUser!: UserEntity | null;

  @Column({ type: 'uuid', name: 'partner_exchange_id', nullable: true })
  partnerExchangeId!: string | null;

  @ManyToOne(() => PartnerExchangeEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity | null;

  @Column({ type: 'timestamptz', name: 'authorized_at', nullable: true })
  authorizedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'failed_at', nullable: true })
  failedAt!: Date | null;

  @Column({ type: 'varchar', length: 80, name: 'failure_code', nullable: true })
  failureCode!: string | null;

  @Column({ type: 'text', name: 'failure_message', nullable: true })
  failureMessage!: string | null;

  @Column({ type: 'jsonb', name: 'metadata', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
