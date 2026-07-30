import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { NotificationEventType } from '../../domain/enums/notification-event-type.enum';
import { NotificationPriority } from '../../domain/enums/notification-priority.enum';
import { NotificationReferenceType } from '../../domain/enums/notification-reference-type.enum';
import { NotificationRecipientEntity } from './notification-recipient.entity';

/**
 * notification_events — 알림 대상 업무 사건(1건).
 * 수신·읽음은 notification_recipients에서 관리한다.
 */
@Entity({ name: 'notification_events' })
@Index('ux_notification_events_type_reference', [
  'eventType',
  'referenceType',
  'referenceId',
], { unique: true })
@Index('ix_notification_events_type_occurred', ['eventType', 'occurredAt'])
@Index('ix_notification_events_reference', ['referenceType', 'referenceId'])
@Check(
  'ck_notification_events_title_not_blank',
  'length(trim("title")) > 0',
)
@Check(
  'ck_notification_events_message_not_blank',
  'length(trim("message")) > 0',
)
export class NotificationEventEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({
    type: 'enum',
    enum: NotificationEventType,
    enumName: 'notification_event_type',
    name: 'event_type',
  })
  eventType!: NotificationEventType;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    enumName: 'notification_priority',
    name: 'priority',
    default: NotificationPriority.NORMAL,
  })
  priority!: NotificationPriority;

  @Column({ type: 'varchar', length: 200, name: 'title' })
  title!: string;

  @Column({ type: 'varchar', length: 1000, name: 'message' })
  message!: string;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id' })
  actorUser!: UserEntity | null;

  @Column({
    type: 'enum',
    enum: NotificationReferenceType,
    enumName: 'notification_reference_type',
    name: 'reference_type',
  })
  referenceType!: NotificationReferenceType;

  @Column({ type: 'uuid', name: 'reference_id' })
  referenceId!: string;

  @Column({ type: 'varchar', length: 500, name: 'action_path', nullable: true })
  actionPath!: string | null;

  @Column({ type: 'jsonb', name: 'payload', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({
    type: 'timestamptz',
    name: 'occurred_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @OneToMany(
    () => NotificationRecipientEntity,
    (recipient) => recipient.notificationEvent,
  )
  recipients!: NotificationRecipientEntity[];
}
