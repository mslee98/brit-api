import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { BankEntity } from '../../../banks/infrastructure/entities/bank.entity';
import { UserBankAccountStatus } from '../../domain/enums/user-bank-account-status.enum';
import { UserEntity } from './user.entity';

@Entity({ name: 'user_bank_accounts' })
@Index('ux_user_bank_accounts_account_number_hash', ['accountNumberHash'], {
  unique: true,
})
@Index('ux_user_bank_accounts_active_user', ['userId'], {
  unique: true,
  where: `"status" = 'ACTIVE'`,
})
@Index('ix_user_bank_accounts_bank_code', ['bankCode'])
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
    onDelete: 'CASCADE',
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
   * AES-GCM 등으로 암호화한 실제 계좌번호.
   * 암호화 키는 환경변수나 KMS에서 관리한다.
   */
  @Column({
    type: 'text',
    name: 'account_number_encrypted',
  })
  accountNumberEncrypted!: string;

  /**
   * 중복 계좌 확인용 단방향 해시.
   * HMAC-SHA256 권장.
   */
  @Column({
    type: 'char',
    length: 64,
    name: 'account_number_hash',
  })
  accountNumberHash!: string;

  /**
   * 사용자 및 어드민 화면 표시용.
   * 예: 110-***-123456
   */
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
    enumName: 'user_bank_account_status',
    name: 'status',
    default: UserBankAccountStatus.ACTIVE,
  })
  status!: UserBankAccountStatus;

  @Column({
    type: 'timestamptz',
    name: 'verified_at',
  })
  verifiedAt!: Date;

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
