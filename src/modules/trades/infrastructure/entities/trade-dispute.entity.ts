import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { TradeDisputePriority } from '../../domain/enums/trade-dispute-priority.enum';
import { TradeDisputeResolution } from '../../domain/enums/trade-dispute-resolution.enum';
import { TradeDisputeStatus } from '../../domain/enums/trade-dispute-status.enum';
import { TradeEntity } from './trade.entity';

/**
 * trade_disputes — 거래 분쟁 현재 상태.
 * P0-6는 판매자 확인 timeout 자동 생성만. Workbench는 P0-7.
 */
@Entity({ name: 'trade_disputes' })
@Index('ux_trade_disputes_dispute_number', ['disputeNumber'], { unique: true })
@Index('ux_trade_disputes_trade_id', ['tradeId'], { unique: true })
@Index('ix_trade_disputes_assigned_status', ['assignedAdminUserId', 'status'])
export class TradeDisputeEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 40, name: 'dispute_number' })
  disputeNumber!: string;

  @Column({ type: 'uuid', name: 'trade_id' })
  tradeId!: string;

  @OneToOne(() => TradeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'trade_id', referencedColumnName: 'id' })
  trade!: TradeEntity;

  @Column({ type: 'varchar', length: 50, name: 'reason_code' })
  reasonCode!: string;

  @Column({
    type: 'enum',
    enum: TradeDisputeStatus,
    enumName: 'trade_dispute_status',
    name: 'status',
  })
  status!: TradeDisputeStatus;

  @Column({
    type: 'enum',
    enum: TradeDisputePriority,
    enumName: 'trade_dispute_priority',
    name: 'priority',
    default: TradeDisputePriority.NORMAL,
  })
  priority!: TradeDisputePriority;

  @Column({ type: 'uuid', name: 'requested_by_user_id', nullable: true })
  requestedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by_user_id', referencedColumnName: 'id' })
  requestedByUser!: UserEntity | null;

  @Column({ type: 'uuid', name: 'assigned_admin_user_id', nullable: true })
  assignedAdminUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_admin_user_id', referencedColumnName: 'id' })
  assignedAdminUser!: UserEntity | null;

  @Column({ type: 'uuid', name: 'leader_admin_user_id', nullable: true })
  leaderAdminUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'leader_admin_user_id', referencedColumnName: 'id' })
  leaderAdminUser!: UserEntity | null;

  @Column({
    type: 'enum',
    enum: TradeDisputeResolution,
    enumName: 'trade_dispute_resolution',
    name: 'resolution',
    nullable: true,
  })
  resolution!: TradeDisputeResolution | null;

  @Column({
    type: 'varchar',
    length: 1000,
    name: 'resolution_reason',
    nullable: true,
  })
  resolutionReason!: string | null;

  @Column({ type: 'timestamptz', name: 'requested_at' })
  requestedAt!: Date;

  @Column({ type: 'timestamptz', name: 'assigned_at', nullable: true })
  assignedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
