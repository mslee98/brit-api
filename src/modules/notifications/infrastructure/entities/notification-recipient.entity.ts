import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import type { NotificationCopyRole } from '../../domain/constants/notification.constants';
import { NotificationEventEntity } from './notification-event.entity';

/**
 * notification_recipients — 알림 사건별 수신·읽음·보관 상태.
 * 업무 처리 완료 여부와는 무관하다.
 */
@Entity({ name: 'notification_recipients' })
@Index(
  'ux_notification_recipients_event_recipient',
  ['notificationEventId', 'recipientUserId'],
  { unique: true },
)
@Check(
  'ck_notification_recipients_read',
  `("is_read" = false AND "read_at" IS NULL) OR ("is_read" = true AND "read_at" IS NOT NULL)`,
)
@Check(
  'ck_notification_recipients_archived',
  `("is_archived" = false AND "archived_at" IS NULL) OR ("is_archived" = true AND "archived_at" IS NOT NULL)`,
)
export class NotificationRecipientEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'notification_event_id' })
  notificationEventId!: string;

  @ManyToOne(() => NotificationEventEntity, (event) => event.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_event_id', referencedColumnName: 'id' })
  notificationEvent!: NotificationEventEntity;

  @Column({ type: 'uuid', name: 'recipient_user_id' })
  recipientUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipient_user_id', referencedColumnName: 'id' })
  recipientUser!: UserEntity;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'boolean', name: 'is_archived', default: false })
  isArchived!: boolean;

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt!: Date | null;

  /**
   * 수신자별 표현. 한 사건(거래 완료 등)을 구매·판매 양쪽이 받을 때
   * 역할별 문구·이동 경로·상대방이 다르다. NULL이면 사건 값을 쓴다.
   */
  @Column({
    type: 'varchar',
    length: 16,
    name: 'recipient_role',
    nullable: true,
  })
  recipientRole!: NotificationCopyRole | null;

  @Column({ type: 'varchar', length: 200, name: 'title', nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 1000, name: 'message', nullable: true })
  message!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'action_path', nullable: true })
  actionPath!: string | null;

  /** 발송 시점 스냅샷: coinAmount, counterpartyNicknameMasked */
  @Column({ type: 'jsonb', name: 'payload', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
