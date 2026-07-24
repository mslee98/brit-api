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
@Check(
  'ck_banks_regular_rule_required',
  `(
    "regular_maintenance_start" IS NULL
    AND "regular_maintenance_end" IS NULL
    AND "regular_maintenance_rule" IS NULL
  ) OR (
    "regular_maintenance_start" IS NOT NULL
    AND "regular_maintenance_end" IS NOT NULL
    AND "regular_maintenance_rule" IS NOT NULL
  )`,
)
@Check('ck_banks_sort_order', '"sort_order" >= 0')
export class BankEntity {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'id',
  })
  id!: string;

  /**
   * 외부 계좌 인증 API 및 내부 업무에서 사용하는 은행 코드.
   * 예: 004, 088
   */
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

  /**
   * 프론트가 은행 아이콘을 찾을 때 사용하는 안정적인 키.
   * 예: kb, shinhan, toss
   */
  @Column({
    type: 'varchar',
    length: 50,
    name: 'icon_key',
  })
  iconKey!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'svg_filename',
  })
  svgFilename!: string;

  /**
   * TIME 타입은 TypeORM에서 문자열 HH:mm:ss로 다루는 것이 안전하다.
   */
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

  /**
   * 예:
   * EVERY_SECOND_SUNDAY
   * EVERY_THIRD_SUNDAY
   * MONTHLY_15TH
   */
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

  /**
   * false이면 신규 계좌 등록 화면에서 선택할 수 없다.
   *
   * 현재 점검 중인지 여부는 별도로 점검 시간을 계산한다.
   */
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
