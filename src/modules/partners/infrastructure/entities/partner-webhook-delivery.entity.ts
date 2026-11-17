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

import { PartnerWebhookDeliveryStatus } from '../../domain/enums/partner-webhook-delivery-status.enum';
import { PartnerClientEntity } from './partner-client.entity';
import { PartnerExchangeEventEntity } from './partner-exchange-event.entity';

/**
 * partner_webhook_deliveries — 확정 이벤트 Webhook 전송 Outbox (B4-5).
 * 전송 실패해도 Exchange/원장은 변경하지 않는다.
 */
@Entity({ name: 'partner_webhook_deliveries' })
@Index('ux_partner_webhook_deliveries_event_client', [
  'partnerExchangeEventId',
  'partnerClientId',
], { unique: true })
@Index('ix_partner_webhook_deliveries_claim', [
  'status',
  'nextAttemptAt',
  'leaseExpiresAt',
])
export class PartnerWebhookDeliveryEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_exchange_event_id' })
  partnerExchangeEventId!: string;

  @ManyToOne(() => PartnerExchangeEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'partner_exchange_event_id',
    referencedColumnName: 'id',
  })
  partnerExchangeEvent!: PartnerExchangeEventEntity;

  @Column({ type: 'uuid', name: 'partner_client_id' })
  partnerClientId!: string;

  @ManyToOne(() => PartnerClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity;

  @Column({ type: 'varchar', length: 500, name: 'destination_url' })
  destinationUrl!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerWebhookDeliveryStatus.PENDING,
  })
  status!: PartnerWebhookDeliveryStatus;

  @Column({ type: 'int', name: 'attempt_count', default: 0 })
  attemptCount!: number;

  @Column({
    type: 'timestamptz',
    name: 'next_attempt_at',
    default: () => 'now()',
  })
  nextAttemptAt!: Date;

  @Column({ type: 'varchar', length: 120, name: 'locked_by', nullable: true })
  lockedBy!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'lease_expires_at',
    nullable: true,
  })
  leaseExpiresAt!: Date | null;

  @Column({ type: 'bigint', name: 'fence_token', default: 0 })
  fenceToken!: string;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  httpStatus!: number | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'last_error',
    nullable: true,
  })
  lastError!: string | null;

  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
