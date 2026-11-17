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

import { PartnerExchangeJobStatus } from '../../domain/enums/partner-exchange-job-status.enum';
import { PartnerExchangeJobType } from '../../domain/enums/partner-exchange-job-type.enum';
import { PartnerExchangeEntity } from './partner-exchange.entity';

/**
 * partner_exchange_jobs — CHARGE 지급 Outbox (B4-4).
 * Attempt(호출 이력)와 분리: 재시도·Lease·다음 실행 시각만 담당.
 */
@Entity({ name: 'partner_exchange_jobs' })
@Index('ux_partner_exchange_jobs_exchange', ['partnerExchangeId'], {
  unique: true,
})
@Index('ix_partner_exchange_jobs_claim', [
  'status',
  'nextRunAt',
  'leaseExpiresAt',
])
export class PartnerExchangeJobEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_exchange_id' })
  partnerExchangeId!: string;

  @ManyToOne(() => PartnerExchangeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity;

  @Column({ type: 'varchar', length: 20, name: 'job_type' })
  jobType!: PartnerExchangeJobType;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerExchangeJobStatus.PENDING,
  })
  status!: PartnerExchangeJobStatus;

  @Column({ type: 'int', name: 'attempt_count', default: 0 })
  attemptCount!: number;

  @Column({
    type: 'timestamptz',
    name: 'next_run_at',
    default: () => 'now()',
  })
  nextRunAt!: Date;

  @Column({ type: 'varchar', length: 120, name: 'locked_by', nullable: true })
  lockedBy!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'lease_expires_at',
    nullable: true,
  })
  leaseExpiresAt!: Date | null;

  /** Lease 재획득 시 증가 — 지연 응답 fencing */
  @Column({ type: 'bigint', name: 'fence_token', default: 0 })
  fenceToken!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'last_error_code',
    nullable: true,
  })
  lastErrorCode!: string | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
