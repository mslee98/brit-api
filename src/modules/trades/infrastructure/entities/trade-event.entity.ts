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
import { TradeEventActorType } from '../../domain/enums/trade-event-actor-type.enum';
import { TradeStatus } from '../../domain/enums/trade-status.enum';
import { TradeEntity } from './trade.entity';

/**
 * trade_events — 거래 상태/사건 불변 로그.
 */
@Entity({ name: 'trade_events' })
@Index('ix_trade_events_trade_created', ['tradeId', 'createdAt'])
export class TradeEventEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'trade_id' })
  tradeId!: string;

  @ManyToOne(() => TradeEntity, (trade) => trade.events, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'trade_id', referencedColumnName: 'id' })
  trade!: TradeEntity;

  @Column({
    type: 'enum',
    enum: TradeStatus,
    enumName: 'trade_status',
    name: 'previous_status',
    nullable: true,
  })
  previousStatus!: TradeStatus | null;

  @Column({
    type: 'enum',
    enum: TradeStatus,
    enumName: 'trade_status',
    name: 'new_status',
    nullable: true,
  })
  newStatus!: TradeStatus | null;

  @Column({ type: 'varchar', length: 50, name: 'event_code' })
  eventCode!: string;

  @Column({
    type: 'enum',
    enum: TradeEventActorType,
    enumName: 'trade_event_actor_type',
    name: 'actor_type',
  })
  actorType!: TradeEventActorType;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id' })
  actorUser!: UserEntity | null;

  @Column({ type: 'varchar', length: 1000, name: 'message', nullable: true })
  message!: string | null;

  @Column({ type: 'jsonb', name: 'metadata', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
