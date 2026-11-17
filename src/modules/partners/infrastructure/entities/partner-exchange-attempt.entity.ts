import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PartnerExchangeAttemptResult } from '../../domain/enums/partner-exchange-attempt-result.enum';
import { PartnerExchangeAttemptType } from '../../domain/enums/partner-exchange-attempt-type.enum';
import { PartnerExternalResultStatus } from '../../domain/enums/partner-external-result-status.enum';
import { PartnerExchangeEntity } from './partner-exchange.entity';

/**
 * partner_exchange_attempts — 업체 Operations CREDIT/STATUS 호출 이력 (B4-2).
 * 본문 전문은 저장하지 않고 request_hash·진단 필드만 둔다.
 */
@Entity({ name: 'partner_exchange_attempts' })
@Index('ux_partner_exchange_attempts_exchange_no', ['partnerExchangeId', 'attemptNo'], {
  unique: true,
})
@Index('ux_partner_exchange_attempts_request_id', ['requestId'], { unique: true })
@Index('ix_partner_exchange_attempts_exchange_started', [
  'partnerExchangeId',
  'startedAt',
])
export class PartnerExchangeAttemptEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_exchange_id' })
  partnerExchangeId!: string;

  @ManyToOne(() => PartnerExchangeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity;

  @Column({ type: 'int', name: 'attempt_no' })
  attemptNo!: number;

  @Column({ type: 'varchar', length: 20, name: 'attempt_type' })
  attemptType!: PartnerExchangeAttemptType;

  @Column({ type: 'uuid', name: 'request_id' })
  requestId!: string;

  @Column({ type: 'varchar', length: 64, name: 'request_hash', nullable: true })
  requestHash!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'result',
    default: PartnerExchangeAttemptResult.REQUESTED,
  })
  result!: PartnerExchangeAttemptResult;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'partner_status',
    nullable: true,
  })
  partnerStatus!: PartnerExternalResultStatus | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'partner_transaction_id',
    nullable: true,
  })
  partnerTransactionId!: string | null;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'varchar', length: 100, name: 'error_code', nullable: true })
  errorCode!: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'error_message',
    nullable: true,
  })
  errorMessage!: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', default: () => 'now()' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
