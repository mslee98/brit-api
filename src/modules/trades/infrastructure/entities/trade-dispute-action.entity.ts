import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { TradeDisputeActionType } from '../../domain/enums/trade-dispute-action-type.enum';
import { TradeDisputeEntity } from './trade-dispute.entity';

/**
 * trade_dispute_actions — 분쟁 채팅·내부메모.
 * 배정/판결 상태 전이는 trade_events. 사용자에게 보이는 줄만 MESSAGE.
 */
@Entity({ name: 'trade_dispute_actions' })
@Index('ix_trade_dispute_actions_dispute_created', ['disputeId', 'createdAt'])
export class TradeDisputeActionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'dispute_id' })
  disputeId!: string;

  @ManyToOne(() => TradeDisputeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'dispute_id', referencedColumnName: 'id' })
  dispute!: TradeDisputeEntity;

  @Column({ type: 'varchar', length: 50, name: 'action_type' })
  actionType!: TradeDisputeActionType;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id' })
  actorUser!: UserEntity | null;

  @Column({ type: 'boolean', name: 'is_internal', default: false })
  isInternal!: boolean;

  @Column({ type: 'text', name: 'message', nullable: true })
  message!: string | null;

  @Column({ type: 'jsonb', name: 'metadata', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
