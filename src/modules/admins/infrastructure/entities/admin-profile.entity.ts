import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';

/**
 * admin_profiles — 관리자 운영 속성 (등급·리더·민감 권한·업무 활성).
 * users 1:1. ADMIN/SYS_ADMIN 역할과 함께 사용한다.
 */
@Entity({ name: 'admin_profiles' })
@Index('ix_admin_profiles_active_level', ['isActive', 'adminLevel'])
@Check('ck_admin_profiles_admin_level', `"admin_level" BETWEEN 1 AND 3`)
export class AdminProfileEntity {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({
    type: 'smallint',
    name: 'admin_level',
    default: 1,
  })
  adminLevel!: number;

  @Column({
    type: 'boolean',
    name: 'is_leader',
    default: false,
  })
  isLeader!: boolean;

  @Column({
    type: 'boolean',
    name: 'can_view_revenue',
    default: false,
  })
  canViewRevenue!: boolean;

  @Column({
    type: 'boolean',
    name: 'can_view_full_identity',
    default: false,
  })
  canViewFullIdentity!: boolean;

  @Column({
    type: 'boolean',
    name: 'is_active',
    default: true,
  })
  isActive!: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    name: 'updated_at',
  })
  updatedAt!: Date;
}
