import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserBankAccountEntity } from '../../../users/infrastructure/entities/user-bank-account.entity';

/**
 * banks — 은행 마스터 (코드·아이콘·점검 시간).
 * user_bank_accounts.bank_code → banks.code (FK).
 * 시드: migrations SeedBanksFull / AlignUsersToErdV3 재시드.
 */
@Entity({ name: 'banks' })
@Index('ux_banks_code', ['code'], { unique: true })
@Index('ux_banks_icon_key', ['iconKey'], { unique: true })
@Index('ix_banks_active_sort', ['isActive', 'sortOrder'])
@Check(
  'ck_banks_daily_maintenance_pair',
  `(
    "daily_maintenance_start" IS NULL
    AND "daily_maintenance_end" IS NULL
  ) OR (
    "daily_maintenance_start" IS NOT NULL
    AND "daily_maintenance_end" IS NOT NULL
  )`,
)
@Check(
  'ck_banks_regular_maintenance_pair',
  `(
    "regular_maintenance_start" IS NULL
    AND "regular_maintenance_end" IS NULL
  ) OR (
    "regular_maintenance_start" IS NOT NULL
    AND "regular_maintenance_end" IS NOT NULL
  )`,
)
@Check('ck_banks_sort_order', '"sort_order" >= 0')
export class BankEntity {
  @PrimaryGeneratedColumn({
    type: 'smallint',
    name: 'id',
  })
  id!: number;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'code',
  })
  code!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'name',
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'icon_key',
    nullable: true,
  })
  iconKey!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'svg_filename',
    nullable: true,
  })
  svgFilename!: string | null;

  @Column({
    type: 'time',
    name: 'daily_maintenance_start',
    nullable: true,
  })
  dailyMaintenanceStart!: string | null;

  @Column({
    type: 'time',
    name: 'daily_maintenance_end',
    nullable: true,
  })
  dailyMaintenanceEnd!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'regular_maintenance_rule',
    nullable: true,
  })
  regularMaintenanceRule!: string | null;

  @Column({
    type: 'time',
    name: 'regular_maintenance_start',
    nullable: true,
  })
  regularMaintenanceStart!: string | null;

  @Column({
    type: 'time',
    name: 'regular_maintenance_end',
    nullable: true,
  })
  regularMaintenanceEnd!: string | null;

  @Column({
    type: 'text',
    name: 'maintenance_note',
    nullable: true,
  })
  maintenanceNote!: string | null;

  @Column({
    type: 'smallint',
    name: 'sort_order',
    default: 0,
  })
  sortOrder!: number;

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

  @OneToMany(() => UserBankAccountEntity, (bankAccount) => bankAccount.bank)
  userBankAccounts!: UserBankAccountEntity[];
}
