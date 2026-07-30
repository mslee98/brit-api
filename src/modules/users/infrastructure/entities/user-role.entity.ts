import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { RoleGrantStatus } from '../../domain/enums/role-grant-status.enum';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserEntity } from './user.entity';

/**
 * user_roles — USER/ADMIN/SYS_ADMIN 전역 역할의 부여·회수 이력.
 *
 * - UUID PK (복합 PK가 아님). 같은 사용자에게 역할 재부여 시 새 행 가능
 * - 가입 시 USER + ACTIVE, granted_by_user_id = null (시스템)
 * - 회수 시 status=REVOKED + revoked_at 필수
 * - 업체별 역할은 이 테이블이 아니라 partner_members (후속)
 */
@Entity({ name: 'user_roles' })
@Index('ix_user_roles_user_id', ['userId'])
@Index('ix_user_roles_role', ['role'])
@Check(
  'ck_user_roles_revoked_requires_at',
  `"status" <> 'REVOKED' OR "revoked_at" IS NOT NULL`,
)
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  @Column({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.roles, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    name: 'role',
  })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: RoleGrantStatus,
    enumName: 'role_grant_status',
    name: 'status',
    default: RoleGrantStatus.ACTIVE,
  })
  status!: RoleGrantStatus;

  @Column({
    type: 'uuid',
    name: 'granted_by_user_id',
    nullable: true,
  })
  grantedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({
    name: 'granted_by_user_id',
    referencedColumnName: 'id',
  })
  grantedByUser!: UserEntity | null;

  @Column({
    type: 'timestamptz',
    name: 'granted_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  grantedAt!: Date;

  @Column({
    type: 'uuid',
    name: 'revoked_by_user_id',
    nullable: true,
  })
  revokedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({
    name: 'revoked_by_user_id',
    referencedColumnName: 'id',
  })
  revokedByUser!: UserEntity | null;

  @Column({
    type: 'timestamptz',
    name: 'revoked_at',
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'revoke_reason',
    nullable: true,
  })
  revokeReason!: string | null;
}
