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
import { NotificationOutboxStatus } from '../../domain/enums/notification-outbox-status.enum';
import { NotificationEventEntity } from './notification-event.entity';

@Entity({ name: 'notification_outbox' })
@Index('ix_notification_outbox_pending', ['status', 'nextAttemptAt'])
@Index('ux_notification_outbox_event_recipient', ['notificationEventId', 'recipientUserId'], {
  unique: true,
})
export class NotificationOutboxEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'notification_event_id' })
  notificationEventId!: string;

  @ManyToOne(() => NotificationEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_event_id', referencedColumnName: 'id' })
  notificationEvent!: NotificationEventEntity;

  @Column({ type: 'uuid', name: 'recipient_user_id' })
  recipientUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_user_id', referencedColumnName: 'id' })
  recipientUser!: UserEntity;

  @Column({
    type: 'enum',
    enum: NotificationOutboxStatus,
    enumName: 'notification_outbox_status',
    name: 'status',
    default: NotificationOutboxStatus.PENDING,
  })
  status!: NotificationOutboxStatus;

  @Column({ type: 'int', name: 'attempt_count', default: 0 })
  attemptCount!: number;

  @Column({
    type: 'timestamptz',
    name: 'next_attempt_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextAttemptAt!: Date;

  @Column({ type: 'varchar', length: 500, name: 'last_error', nullable: true })
  lastError!: string | null;

  @Column({ type: 'jsonb', name: 'payload', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
