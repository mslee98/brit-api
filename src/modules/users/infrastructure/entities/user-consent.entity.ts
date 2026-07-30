import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ConsentType } from '../../domain/enums/consent-type.enum';
import { UserEntity } from './user.entity';

/**
 * user_consents — 약관·개인정보 등 동의 이력 (문서 버전별 행).
 *
 * 예전 P0의 “한 행에 boolean 컬럼 여러 개”가 아니라,
 * (user_id, consent_type, document_version)마다 INSERT한다.
 * 가입 API: SignupDto.consents.items → createUserInTransaction
 */
@Entity({ name: 'user_consents' })
@Index('ux_user_consents_user_type_version', [
  'userId',
  'consentType',
  'documentVersion',
], { unique: true })
@Check(
  'ck_user_consents_type',
  `"consent_type" IN ('SERVICE','PRIVACY','UNIQUE_IDENTIFIER','BANK_ACCOUNT','MARKETING')`,
)
@Check(
  'ck_user_consents_agreed_requires_at',
  `"is_agreed" = false OR "agreed_at" IS NOT NULL`,
)
export class UserConsentEntity {
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
    type: 'varchar',
    length: 30,
    name: 'consent_type',
  })
  consentType!: ConsentType;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'document_version',
  })
  documentVersion!: string;

  @Column({
    type: 'boolean',
    name: 'is_agreed',
  })
  isAgreed!: boolean;

  @Column({
    type: 'timestamptz',
    name: 'agreed_at',
    nullable: true,
  })
  agreedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'revoked_at',
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    type: 'jsonb',
    name: 'evidence',
    default: () => "'{}'::jsonb",
  })
  evidence!: Record<string, unknown>;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;
}
