import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserSessionEntity } from '../../../auth/infrastructure/entities/user-session.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { UserBankAccountEntity } from './user-bank-account.entity';
import { UserProfileEntity } from './user-profile.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity({ name: 'users' })
@Index('ux_users_login_id', ['loginId'], { unique: true })
@Index('ux_users_phone_e164', ['phoneE164'], { unique: true })
@Index('ix_users_status', ['status'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  /**
   * 사용자가 직접 입력하는 로그인 ID.
   *
   * 휴대폰 번호와 별도로 관리한다.
   * 대소문자를 구분하지 않을 예정이라면 저장 전에 소문자로 정규화한다.
   */
  @Column({
    type: 'varchar',
    length: 30,
    name: 'login_id',
  })
  loginId!: string;

  /**
   * Argon2id 또는 bcrypt로 해시한 비밀번호.
   * 원문 비밀번호는 절대 저장하지 않는다.
   */
  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
  })
  passwordHash!: string;

  /**
   * E.164 형식으로 정규화된 전화번호.
   * 예: +821012345678
   */
  @Column({
    type: 'varchar',
    length: 20,
    name: 'phone_e164',
  })
  phoneE164!: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    name: 'status',
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({
    type: 'timestamptz',
    name: 'last_login_at',
    nullable: true,
  })
  lastLoginAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'password_changed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  passwordChangedAt!: Date;

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

  @OneToOne(() => UserProfileEntity, (profile) => profile.user)
  profile!: UserProfileEntity;

  @OneToMany(() => UserRoleEntity, (role) => role.user)
  roles!: UserRoleEntity[];

  @OneToMany(() => UserBankAccountEntity, (bankAccount) => bankAccount.user)
  bankAccounts!: UserBankAccountEntity[];

  @OneToMany(() => UserSessionEntity, (session) => session.user)
  sessions!: UserSessionEntity[];
}
