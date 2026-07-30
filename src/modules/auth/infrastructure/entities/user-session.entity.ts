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
import { UserSessionStatus } from '../../domain/enums/user-session-status.enum';

/**
 * user_sessions — Refresh Token 세션 (AuthModule 소유).
 *
 * - refresh_token_hash만 저장 (원문 토큰은 클라이언트에만)
 * - 가입(signup) 시에는 세션을 만들지 않음 (PENDING + 토큰 미발급)
 * - 로그인/refresh 시에만 ACTIVE 세션 생성·회전
 * - JWT access payload의 sid = 이 테이블 id
 */
@Entity({ name: 'user_sessions' })
@Index('ix_user_sessions_user_status', ['userId', 'status'])
@Index('ix_user_sessions_expires_at', ['expiresAt'])
@Index('ux_user_sessions_refresh_token_hash', ['refreshTokenHash'], {
  unique: true,
})
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  @Column({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.sessions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'refresh_token_hash',
  })
  refreshTokenHash!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'device_id',
    nullable: true,
  })
  deviceId!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'device_name',
    nullable: true,
  })
  deviceName!: string | null;

  @Column({
    type: 'text',
    name: 'user_agent',
    nullable: true,
  })
  userAgent!: string | null;

  @Column({
    type: 'inet',
    name: 'ip_address',
    nullable: true,
  })
  ipAddress!: string | null;

  @Column({
    type: 'enum',
    enum: UserSessionStatus,
    enumName: 'session_status',
    name: 'status',
    default: UserSessionStatus.ACTIVE,
  })
  status!: UserSessionStatus;

  @Column({
    type: 'timestamptz',
    name: 'expires_at',
  })
  expiresAt!: Date;

  @Column({
    type: 'timestamptz',
    name: 'last_used_at',
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'revoked_at',
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'revoke_reason',
    nullable: true,
  })
  revokeReason!: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;
}
