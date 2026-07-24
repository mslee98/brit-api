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

import { GenderCode } from '../../domain/enums/gender-code.enum';
import { MobileCarrier } from '../../domain/enums/mobile-carrier.enum';
import { UserEntity } from './user.entity';

@Entity({ name: 'user_profiles' })
@Index('ux_user_profiles_nickname', ['nickname'], { unique: true })
@Index('ux_user_profiles_identity_key_hash', ['identityKeyHash'], {
  unique: true,
})
@Index('ux_user_profiles_octomo_request_id', ['octomoRequestId'], {
  unique: true,
  where: '"octomo_request_id" IS NOT NULL',
})
@Check(
  'ck_user_profiles_pin_failed_count',
  '"transaction_pin_failed_count" >= 0',
)
export class UserProfileEntity {
  @PrimaryColumn({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @OneToOne(() => UserEntity, (user) => user.profile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'name',
  })
  name!: string;

  /**
   * PostgreSQL DATE는 시간대가 없는 날짜이므로
   * TypeORM에서는 문자열 YYYY-MM-DD로 다루는 편이 안전하다.
   */
  @Column({
    type: 'date',
    name: 'birth_date',
  })
  birthDate!: string;

  @Column({
    type: 'enum',
    enum: GenderCode,
    enumName: 'gender_code',
    name: 'gender_code',
  })
  genderCode!: GenderCode;

  @Column({
    type: 'enum',
    enum: MobileCarrier,
    enumName: 'mobile_carrier',
    name: 'mobile_carrier',
  })
  mobileCarrier!: MobileCarrier;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'nickname',
  })
  nickname!: string;

  /**
   * 중복 가입 방지용 식별 해시.
   *
   * 주민번호나 본인 식별 원문을 저장하지 않고,
   * 서버의 비밀값과 조합해 HMAC-SHA256 등의 방식으로 생성한다.
   */
  @Column({
    type: 'char',
    length: 64,
    name: 'identity_key_hash',
  })
  identityKeyHash!: string;

  /**
   * 가입에 사용된 OCTOMO 요청 식별자.
   *
   * 현재 P0에서는 최종 성공 요청 ID만 보관한다.
   * 인증 재시도 이력이 필요해지면 별도 인증 테이블로 분리한다.
   */
  @Column({
    type: 'varchar',
    length: 100,
    name: 'octomo_request_id',
    nullable: true,
  })
  octomoRequestId!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'phone_verified_at',
  })
  phoneVerifiedAt!: Date;

  @Column({
    type: 'timestamptz',
    name: 'identity_verified_at',
  })
  identityVerifiedAt!: Date;

  /**
   * 사용자가 설정한 6자리 거래 PIN의 해시.
   */
  @Column({
    type: 'varchar',
    length: 255,
    name: 'transaction_pin_hash',
  })
  transactionPinHash!: string;

  @Column({
    type: 'smallint',
    name: 'transaction_pin_failed_count',
    default: 0,
  })
  transactionPinFailedCount!: number;

  @Column({
    type: 'timestamptz',
    name: 'transaction_pin_locked_until',
    nullable: true,
  })
  transactionPinLockedUntil!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'transaction_pin_changed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  transactionPinChangedAt!: Date;

  @Column({
    type: 'text',
    name: 'profile_image_path',
    nullable: true,
  })
  profileImagePath!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'profile_image_updated_at',
    nullable: true,
  })
  profileImageUpdatedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'suspended_reason',
    nullable: true,
  })
  suspendedReason!: string | null;

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
