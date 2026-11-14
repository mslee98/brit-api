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
 * partner_payment_intents — 업체 CHARGE 일회성 Intent (B3).
 * 실제 원장은 partner_exchanges. Embed에서 PIN 승인 후 동기 charge.
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

  /** CHARGE 금액 (MS, 양의 정수 문자열) */
  @Column({ type: 'bigint', name: 'amount' })
  amount!: string;

  /** Intent 생성 시 수수료 스냅샷 (표시·감사). 사용자 MS 차감은 amount */
  @Column({ type: 'bigint', name: 'fee_amount', default: '0' })
  feeAmount!: string;

  @Column({ type: 'bigint', name: 'total_debit', default: '0' })
  totalDebit!: string;

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
