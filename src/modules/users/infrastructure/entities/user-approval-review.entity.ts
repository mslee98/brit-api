import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ApprovalDecision } from '../../domain/enums/approval-decision.enum';
import { UserBankAccountEntity } from './user-bank-account.entity';
import { UserEntity } from './user.entity';

/**
 * user_approval_reviews — 가입 승인/반려 불변 이력 + 수동 확인 체크리스트.
 *
 * 관리자 승인 API에서 INSERT (현재 후속 작업).
 * APPROVED면 identity/phone/bank/holder 체크가 모두 true여야 함 (DB CHECK).
 * bank_account_id + user_id 복합 FK로 해당 사용자 계좌만 심사 가능.
 */
@Entity({ name: 'user_approval_reviews' })
@Check(
  'ck_user_approval_reviews_not_self',
  '"user_id" <> "reviewed_by_user_id"',
)
@Check(
  'ck_user_approval_reviews_approved',
  `"decision" <> 'APPROVED' OR ("identity_checked" AND "phone_checked" AND "bank_account_checked" AND "holder_name_matched")`,
)
@Check(
  'ck_user_approval_reviews_rejected',
  `"decision" <> 'REJECTED' OR "review_reason" IS NOT NULL`,
)
export class UserApprovalReviewEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  @Column({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @ManyToOne(() => UserEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'uuid',
    name: 'bank_account_id',
  })
  bankAccountId!: string;

  @ManyToOne(() => UserBankAccountEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'bank_account_id', referencedColumnName: 'id' },
    { name: 'user_id', referencedColumnName: 'userId' },
  ])
  bankAccount!: UserBankAccountEntity;

  @Column({
    type: 'enum',
    enum: ApprovalDecision,
    enumName: 'approval_decision',
    name: 'decision',
  })
  decision!: ApprovalDecision;

  @Column({
    type: 'boolean',
    name: 'identity_checked',
    default: false,
  })
  identityChecked!: boolean;

  @Column({
    type: 'boolean',
    name: 'phone_checked',
    default: false,
  })
  phoneChecked!: boolean;

  @Column({
    type: 'boolean',
    name: 'bank_account_checked',
    default: false,
  })
  bankAccountChecked!: boolean;

  @Column({
    type: 'boolean',
    name: 'holder_name_matched',
    default: false,
  })
  holderNameMatched!: boolean;

  @Column({
    type: 'uuid',
    name: 'reviewed_by_user_id',
  })
  reviewedByUserId!: string;

  @ManyToOne(() => UserEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'reviewed_by_user_id',
    referencedColumnName: 'id',
  })
  reviewedByUser!: UserEntity;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'review_reason',
    nullable: true,
  })
  reviewReason!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'reviewed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  reviewedAt!: Date;
}
