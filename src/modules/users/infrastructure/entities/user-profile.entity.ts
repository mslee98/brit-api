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

/**
 * user_profiles — users와 1:1. 실명·주민번호·통신사·거래 PIN·닉네임.
 *
 * ERD v3 정책:
 * - 주민등록번호는 평문 CHAR(14) `000000-0000000` (UNIQUE)
 * - birth_date / gender_code는 클라이언트가 보내지 않고 서버가 RRN에서 파생
 * - 로그·API 응답에 전체 RRN 노출 금지
 *
 * 파생 유틸: `users/utils/rrn.util.ts`
 * 가입 저장: `UserService.createUserInTransaction`
 */
@Entity({ name: 'user_profiles' })
@Index('ux_user_profiles_nickname', ['nickname'], { unique: true })
@Index('ux_user_profiles_resident_registration_number', [
  'residentRegistrationNumber',
], { unique: true })
@Check(
  'ck_user_profiles_pin_failed_count',
  '"pin_failed_count" >= 0',
)
@Check(
  'ck_user_profiles_rrn_format',
  `"resident_registration_number" ~ '^[0-9]{6}-[0-9]{7}$'`,
)
@Check(
  'ck_user_profiles_gender_code',
  `"gender_code" IN ('M', 'F')`,
)
export class UserProfileEntity {
  /** users.id와 동일한 PK (1:1) */
  @PrimaryColumn({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @OneToOne(() => UserEntity, (user) => user.profile, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  /** 가입 시 제출한 실명 */
  @Column({
    type: 'varchar',
    length: 50,
    name: 'name',
  })
  name!: string;

  /**
   * 전체 주민등록번호 평문. 형식: 000000-0000000
   * UNIQUE — 동일 번호로 중복 가입 방지
   */
  @Column({
    type: 'char',
    length: 14,
    name: 'resident_registration_number',
  })
  residentRegistrationNumber!: string;

  /**
   * RRN에서 파생한 생년월일 (DATE → TS는 YYYY-MM-DD 문자열 권장)
   */
  @Column({
    type: 'date',
    name: 'birth_date',
  })
  birthDate!: string;

  /** RRN에서 파생한 성별. 'M' | 'F' */
  @Column({
    type: 'char',
    length: 1,
    name: 'gender_code',
  })
  genderCode!: GenderCode;

  /** 가입자가 선택한 통신사. 외부 인증 결과가 아니다. */
  @Column({
    type: 'varchar',
    length: 20,
    name: 'mobile_carrier',
  })
  mobileCarrier!: MobileCarrier;

  /** 화면 표시용 선택 닉네임. null 가능, UNIQUE(여러 NULL 허용) */
  @Column({
    type: 'varchar',
    length: 30,
    name: 'nickname',
    nullable: true,
  })
  nickname!: string | null;

  /** 거래 승인용 6자리 PIN의 단방향 해시 */
  @Column({
    type: 'varchar',
    length: 255,
    name: 'pin_hash',
  })
  pinHash!: string;

  /** 연속 PIN 검증 실패 횟수 */
  @Column({
    type: 'smallint',
    name: 'pin_failed_count',
    default: 0,
  })
  pinFailedCount!: number;

  /** PIN 잠금 해제 시각. null이면 잠금 아님 */
  @Column({
    type: 'timestamptz',
    name: 'pin_locked_until',
    nullable: true,
  })
  pinLockedUntil!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'pin_changed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  pinChangedAt!: Date;

  /** 스토리지 객체 경로 (URL이 아닌 키/경로) */
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
