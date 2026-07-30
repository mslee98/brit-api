import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { BankEntity } from '../../../banks/infrastructure/entities/bank.entity';
import { UserBankAccountStatus } from '../../domain/enums/user-bank-account-status.enum';
import { UserEntity } from './user.entity';

/**
 * user_bank_accounts — 계좌 이력형 저장.
 *
 * - 계좌번호를 UPDATE로 덮어쓰지 않고 변경 시 새 행 + replaces_bank_account_id
 * - 가입 직후 status = PENDING_APPROVAL
 * - account_number_encrypted: BYTEA (AES-GCM, `account-crypto.util`)
 * - account_number_hash: 중복 검색용 HMAC (UNIQUE)
 * - UNIQUE(id, user_id): 심사 테이블 복합 FK용
 */
@Entity({ name: 'user_bank_accounts' })
@Unique('ux_user_bank_accounts_id_user_id', ['id', 'userId'])
@Index('ux_user_bank_accounts_account_number_hash', ['accountNumberHash'], {
  unique: true,
})
@Index('ix_user_bank_accounts_bank_code', ['bankCode'])
@Index('ix_user_bank_accounts_user_id', ['userId'])
@Check(
  'ck_user_bank_accounts_active',
  `"status" <> 'ACTIVE' OR ("reviewed_at" IS NOT NULL AND "reviewed_by_user_id" IS NOT NULL AND "activated_at" IS NOT NULL)`,
)
@Check(
  'ck_user_bank_accounts_rejected',
  `"status" <> 'REJECTED' OR ("reviewed_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)`,
)
export class UserBankAccountEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  @Column({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.bankAccounts, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'bank_code',
  })
  bankCode!: string;

  @ManyToOne(() => BankEntity, (bank) => bank.userBankAccounts, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'bank_code',
    referencedColumnName: 'code',
  })
  bank!: BankEntity;

  /**
   * AES-GCM 암호문 (BYTEA). 생성: encryptAccountNumber().
   * 복호화 키: ACCOUNT_ENCRYPTION_KEY
   */
  @Column({
    type: 'bytea',
    name: 'account_number_encrypted',
  })
  accountNumberEncrypted!: Buffer;

  /**
   * 중복 계좌 검색용 HMAC-SHA256 hex (64자).
   * pepper: IDENTITY_PEPPER
   */
  @Column({
    type: 'char',
    length: 64,
    name: 'account_number_hash',
  })
  accountNumberHash!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'account_number_masked',
  })
  accountNumberMasked!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'holder_name',
  })
  holderName!: string;

  @Column({
    type: 'enum',
    enum: UserBankAccountStatus,
    enumName: 'bank_account_status',
    name: 'status',
    default: UserBankAccountStatus.PENDING_APPROVAL,
  })
  status!: UserBankAccountStatus;

  @Column({
    type: 'uuid',
    name: 'replaces_bank_account_id',
    nullable: true,
  })
  replacesBankAccountId!: string | null;

  @ManyToOne(() => UserBankAccountEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({
    name: 'replaces_bank_account_id',
    referencedColumnName: 'id',
  })
  replacesBankAccount!: UserBankAccountEntity | null;

  @Column({
    type: 'timestamptz',
    name: 'requested_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  requestedAt!: Date;

  @Column({
    type: 'timestamptz',
    name: 'reviewed_at',
    nullable: true,
  })
  reviewedAt!: Date | null;

  @Column({
    type: 'uuid',
    name: 'reviewed_by_user_id',
    nullable: true,
  })
  reviewedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({
    name: 'reviewed_by_user_id',
    referencedColumnName: 'id',
  })
  reviewedByUser!: UserEntity | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'rejection_reason',
    nullable: true,
  })
  rejectionReason!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'activated_at',
    nullable: true,
  })
  activatedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'suspended_at',
    nullable: true,
  })
  suspendedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'retired_at',
    nullable: true,
  })
  retiredAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'closed_at',
    nullable: true,
  })
  closedAt!: Date | null;

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
