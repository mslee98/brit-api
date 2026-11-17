import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PartnerExchangeEventType } from '../../domain/enums/partner-exchange-event-type.enum';
import { PartnerExchangeEntity } from './partner-exchange.entity';

/**
 * partner_exchange_events — Exchange 최종 상태 불변 기록 (B4-3).
 * Webhook Outbox/전송은 B4-5가 이 이벤트를 소비한다.
 */
@Entity({ name: 'partner_exchange_events' })
@Index('ux_partner_exchange_events_exchange_type', ['partnerExchangeId', 'eventType'], {
  unique: true,
})
@Index('ix_partner_exchange_events_created', ['createdAt'])
export class PartnerExchangeEventEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_exchange_id' })
  partnerExchangeId!: string;

  @ManyToOne(() => PartnerExchangeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity;

  @Column({ type: 'varchar', length: 40, name: 'event_type' })
  eventType!: PartnerExchangeEventType;

  /** 감사·Webhook용 최소 페이로드 (금액·상태 등) */
  @Column({ type: 'jsonb', name: 'payload', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
