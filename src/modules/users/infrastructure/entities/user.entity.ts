import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserSessionEntity } from '../../../auth/infrastructure/entities/user-session.entity';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { UserBankAccountEntity } from './user-bank-account.entity';
import { UserCoinWalletEntity } from './user-coin-wallet.entity';
import { UserProfileEntity } from './user-profile.entity';
import { UserRoleEntity } from './user-role.entity';

/**
 * users — 로그인 자격과 가입/이용 상태의 루트 테이블 (ERD v3).
 *
 * 흐름:
 * - 가입 시 PENDING으로 생성 (외부 본인인증 없음)
 * - 관리자 승인 후 ACTIVE (approved_at + approved_by_user_id 필수)
 * - 반려 REJECTED / 정지 SUSPENDED / 탈퇴 WITHDRAWN
 *
 * 프로필·역할·계좌·지갑·세션은 이 id를 FK로 참조한다.
 * 관련: UserProfileEntity, UserRoleEntity, UserBankAccountEntity,
 *       UserCoinWalletEntity, UserSessionEntity
 */
@Entity({ name: 'users' })
@Index('ux_users_login_id', ['loginId'], { unique: true })
@Index('ux_users_phone_e164', ['phoneE164'], { unique: true })
@Index('ix_users_status', ['status'])
@Check(
  'ck_users_active_requires_approval',
  `"status" <> 'ACTIVE' OR ("approved_at" IS NOT NULL AND "approved_by_user_id" IS NOT NULL)`,
)
@Check(
  'ck_users_rejected_requires_reason',
  `"status" <> 'REJECTED' OR ("rejected_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)`,
)
@Check(
  'ck_users_withdrawn_requires_at',
  `"status" <> 'WITHDRAWN' OR "withdrawn_at" IS NOT NULL`,
)
export class UserEntity {
  /** 전 도메인에서 참조하는 사용자 UUID */
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  /** 로그인 ID. 저장 전 소문자로 정규화한다. */
  @Column({
    type: 'varchar',
    length: 30,
    name: 'login_id',
  })
  loginId!: string;

  /** bcrypt/argon2 해시. 원문 비밀번호는 저장하지 않는다. */
  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
  })
  passwordHash!: string;

  /** E.164 정규화 휴대전화. 승인 전에는 “제출값”일 뿐 외부 인증 완료를 의미하지 않는다. */
  @Column({
    type: 'varchar',
    length: 20,
    name: 'phone_e164',
  })
  phoneE164!: string;

  /** 가입·이용 상태. 기본 PENDING. 로그인은 ACTIVE만 허용. */
  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    name: 'status',
    default: UserStatus.PENDING,
  })
  status!: UserStatus;

  /** 가입 정보 제출 시각 */
  @Column({
    type: 'timestamptz',
    name: 'registration_submitted_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  registrationSubmittedAt!: Date;

  /** 가장 최근 관리자 승인 시각 (ACTIVE일 때 필수) */
  @Column({
    type: 'timestamptz',
    name: 'approved_at',
    nullable: true,
  })
  approvedAt!: Date | null;

  /** 승인을 수행한 관리자 users.id */
  @Column({
    type: 'uuid',
    name: 'approved_by_user_id',
    nullable: true,
  })
  approvedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({
    name: 'approved_by_user_id',
    referencedColumnName: 'id',
  })
  approvedByUser!: UserEntity | null;

  /** 가장 최근 반려 시각 (REJECTED일 때 필수) */
  @Column({
    type: 'timestamptz',
    name: 'rejected_at',
    nullable: true,
  })
  rejectedAt!: Date | null;

  /** 사용자에게 안내하는 반려 사유 (REJECTED일 때 필수) */
  @Column({
    type: 'varchar',
    length: 500,
    name: 'rejection_reason',
    nullable: true,
  })
  rejectionReason!: string | null;

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

  /** 탈퇴 처리 시각 (WITHDRAWN일 때 필수) */
  @Column({
    type: 'timestamptz',
    name: 'withdrawn_at',
    nullable: true,
  })
  withdrawnAt!: Date | null;

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

  /** 1:1 실명·주민번호·PIN 프로필 */
  @OneToOne(() => UserProfileEntity, (profile) => profile.user)
  profile!: UserProfileEntity;

  /** 1:1 Coin 잔액 집계 지갑 */
  @OneToOne(() => UserCoinWalletEntity, (wallet) => wallet.user)
  coinWallet!: UserCoinWalletEntity;

  /** 전역 역할 부여 이력 (USER/ADMIN/SYS_ADMIN) */
  @OneToMany(() => UserRoleEntity, (role) => role.user)
  roles!: UserRoleEntity[];

  /** 계좌 이력 (덮어쓰지 않고 행 추가) */
  @OneToMany(() => UserBankAccountEntity, (bankAccount) => bankAccount.user)
  bankAccounts!: UserBankAccountEntity[];

  /** Refresh 세션 (AuthModule 소유 엔티티) */
  @OneToMany(() => UserSessionEntity, (session) => session.user)
  sessions!: UserSessionEntity[];
}
