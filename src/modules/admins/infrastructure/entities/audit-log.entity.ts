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

/**
 * audit_logs — 민감 운영 행동 불변 로그 (AdminsModule 소유).
 * 비밀번호·토큰 해시·전체 주민번호·전체 계좌번호는 저장하지 않는다.
 */
@Entity({ name: 'audit_logs' })
@Index('ix_audit_logs_actor_created', ['actorUserId', 'createdAt'])
@Index('ix_audit_logs_target', ['targetType', 'targetId'])
@Index('ix_audit_logs_action_created', ['actionType', 'createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id' })
  actorUser!: UserEntity | null;

  @Column({ type: 'varchar', length: 100, name: 'action_type' })
  actionType!: string;

  @Column({ type: 'varchar', length: 50, name: 'target_type' })
  targetType!: string;

  /** UUID 또는 은행 smallint id 문자열 등 대상 식별자 */
  @Column({ type: 'varchar', length: 64, name: 'target_id', nullable: true })
  targetId!: string | null;

  @Column({ type: 'jsonb', name: 'before_data', nullable: true })
  beforeData!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'after_data', nullable: true })
  afterData!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 1000, name: 'reason', nullable: true })
  reason!: string | null;

  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
