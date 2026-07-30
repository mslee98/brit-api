import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BankAccountReviewDecision } from '../../domain/enums/bank-account-review-decision.enum';
import { UserBankAccountStatus } from '../../domain/enums/user-bank-account-status.enum';
import { UserBankAccountEntity } from './user-bank-account.entity';
import { UserEntity } from './user.entity';

/**
 * user_bank_account_reviews — 계좌 승인·반려·정지·재활성·교체·종료 조치 이력.
 * INSERT만 하며 기존 행을 수정하지 않는다 (감사 추적).
 */
@Entity({ name: 'user_bank_account_reviews' })
@Check(
  'ck_user_bank_account_reviews_not_self',
  '"user_id" <> "reviewed_by_user_id"',
)
@Check(
  'ck_user_bank_account_reviews_rejected',
  `"decision" <> 'REJECTED' OR "review_reason" IS NOT NULL`,
)
export class UserBankAccountReviewEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  @Column({
    type: 'uuid',
    name: 'bank_account_id',
  })
  bankAccountId!: string;

  @Column({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

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
    enum: UserBankAccountStatus,
    enumName: 'bank_account_status',
    name: 'previous_status',
  })
  previousStatus!: UserBankAccountStatus;

  @Column({
    type: 'enum',
    enum: BankAccountReviewDecision,
    enumName: 'bank_account_review_decision',
    name: 'decision',
  })
  decision!: BankAccountReviewDecision;

  @Column({
    type: 'enum',
    enum: UserBankAccountStatus,
    enumName: 'bank_account_status',
    name: 'resulting_status',
  })
  resultingStatus!: UserBankAccountStatus;

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
