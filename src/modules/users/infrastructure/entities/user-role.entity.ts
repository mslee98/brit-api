import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { UserRoleType } from '../../domain/enums/user-role.enum';
import { UserEntity } from './user.entity';

@Entity({ name: 'user_roles' })
@Index('ix_user_roles_role', ['role'])
export class UserRoleEntity {
  /**
   * user_id + role 복합 PK.
   *
   * 별도 id 없이도 역할 매핑 자체를 유일하게 식별할 수 있다.
   */
  @PrimaryColumn({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @PrimaryColumn({
    type: 'enum',
    enum: UserRoleType,
    enumName: 'user_role',
    name: 'role',
  })
  role!: UserRoleType;

  @ManyToOne(() => UserEntity, (user) => user.roles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  /**
   * 역할을 부여한 관리자.
   *
   * 일반 회원가입으로 CONSUMER가 자동 부여된 경우 null이다.
   */
  @Column({
    type: 'uuid',
    name: 'granted_by',
    nullable: true,
  })
  grantedBy!: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'granted_at',
  })
  grantedAt!: Date;
}
