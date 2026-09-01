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
import { AdminCoinAdjustmentOperation } from '../../domain/enums/admin-coin-adjustment-operation.enum';
import { AdminCoinAdjustmentRequestStatus } from '../../domain/enums/admin-coin-adjustment-request-status.enum';

/**
 * 관리자 Coin credit/debit Idempotency-Key 기록.
 * (actor_user_id, idempotency_key) UNIQUE.
 */
@Entity({ name: 'admin_coin_adjustment_requests' })
@Index('ux_admin_coin_adj_actor_key', ['actorUserId', 'idempotencyKey'], {
  unique: true,
})
@Index('ix_admin_coin_adj_status_updated', ['status', 'updatedAt'])
export class AdminCoinAdjustmentRequestEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ type: 'uuid', name: 'actor_user_id' })
  actorUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id' })
  actorUser!: UserEntity;

  @Column({ type: 'uuid', name: 'target_user_id' })
  targetUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'target_user_id', referencedColumnName: 'id' })
  targetUser!: UserEntity;

  @Column({
    type: 'enum',
    enum: AdminCoinAdjustmentOperation,
    enumName: 'admin_coin_adjustment_operation',
    name: 'operation',
  })
  operation!: AdminCoinAdjustmentOperation;

  @Column({ type: 'varchar', length: 64, name: 'request_hash' })
  requestHash!: string;

  @Column({
    type: 'enum',
    enum: AdminCoinAdjustmentRequestStatus,
    enumName: 'admin_coin_adjustment_request_status',
    name: 'status',
  })
  status!: AdminCoinAdjustmentRequestStatus;

  @Column({ type: 'jsonb', name: 'response_body', nullable: true })
  responseBody!: Record<string, unknown> | null;

  @Column({ type: 'uuid', name: 'ledger_transaction_id', nullable: true })
  ledgerTransactionId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'failure_code', nullable: true })
  failureCode!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
