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
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  /**
   * Refresh Token 원문이 아닌 해시값.
   */
  @Column({
    type: 'varchar',
    length: 255,
    name: 'refresh_token_hash',
  })
  refreshTokenHash!: string;

  /**
   * 프론트에서 생성한 기기 식별자.
   *
   * 보안 식별자로 완전히 신뢰하지 않고,
   * 세션 표시와 기기 구분 용도로만 사용한다.
   */
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
    enumName: 'user_session_status',
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

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;
}
