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

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { PartnerLinkSessionStatus } from '../../domain/enums/partner-link-session-status.enum';
import { PartnerClientEntity } from './partner-client.entity';
import { PartnerEntity } from './partner.entity';
import { UserPartnerLinkEntity } from './user-partner-link.entity';

/**
 * partner_link_sessions — 최종 사용자 계정 연결 세션 (OAuth authorization code 방식).
 * 세션 토큰·code는 SHA-256 해시만 저장하고 평문은 발급 응답에서 1회만 노출한다.
 */
@Entity({ name: 'partner_link_sessions' })
@Index('ux_partner_link_sessions_token_hash', ['sessionTokenHash'], {
  unique: true,
})
@Index('ux_partner_link_sessions_code_hash', ['authorizationCodeHash'], {
  unique: true,
  where: `"authorization_code_hash" IS NOT NULL`,
})
@Index('ix_partner_link_sessions_partner_created', ['partnerId', 'createdAt'])
export class PartnerLinkSessionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'uuid', name: 'partner_client_id' })
  partnerClientId!: string;

  @ManyToOne(() => PartnerClientEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity;

  @Column({ type: 'varchar', length: 255, name: 'partner_user_key' })
  partnerUserKey!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'partner_user_label',
    nullable: true,
  })
  partnerUserLabel!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'return_origin' })
  returnOrigin!: string;

  @Column({ type: 'varchar', length: 64, name: 'session_token_hash' })
  sessionTokenHash!: string;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'authorization_code_hash',
    nullable: true,
  })
  authorizationCodeHash!: string | null;

  /**
   * Embed wait 폴링용 평문. exchange 또는 만료 시 null.
   * 해시와 달리 팝업(claim 사용자)만 조회한다.
   */
  @Column({
    type: 'varchar',
    length: 128,
    name: 'authorization_code_plain',
    nullable: true,
  })
  authorizationCodePlain!: string | null;

  @Column({ type: 'timestamptz', name: 'code_expires_at', nullable: true })
  codeExpiresAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  /** 연결 코드(4자리) SHA-256. 평문은 Embed claim 후에만 노출(MC-P9). */
  @Column({ type: 'varchar', length: 64, name: 'pairing_code_hash' })
  pairingCodeHash!: string;

  /**
   * Embed 표시용 평문. claim 이후에만 API로 내려보내고,
   * CONSENTED/REJECTED/EXPIRED 시 null로 지운다.
   */
  @Column({
    type: 'varchar',
    length: 4,
    name: 'pairing_code_plain',
    nullable: true,
  })
  pairingCodePlain!: string | null;

  @Column({ type: 'timestamptz', name: 'pairing_expires_at' })
  pairingExpiresAt!: Date;

  @Column({
    type: 'int',
    name: 'pairing_attempt_count',
    default: 0,
  })
  pairingAttemptCount!: number;

  @Column({ type: 'timestamptz', name: 'pairing_verified_at', nullable: true })
  pairingVerifiedAt!: Date | null;

  /** Embed에서 BRIT 로그인 후 고정. 승인·코드 조회는 이 사용자만 (MC-P9). */
  @Column({ type: 'uuid', name: 'claimed_user_id', nullable: true })
  claimedUserId!: string | null;

  @Column({ type: 'timestamptz', name: 'claimed_at', nullable: true })
  claimedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerLinkSessionStatus.PENDING,
  })
  status!: PartnerLinkSessionStatus;

  @Column({ type: 'uuid', name: 'consented_user_id', nullable: true })
  consentedUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'consented_user_id', referencedColumnName: 'id' })
  consentedUser!: UserEntity | null;

  @Column({ type: 'uuid', name: 'user_partner_link_id', nullable: true })
  userPartnerLinkId!: string | null;

  @ManyToOne(() => UserPartnerLinkEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_partner_link_id', referencedColumnName: 'id' })
  userPartnerLink!: UserPartnerLinkEntity | null;

  @Column({ type: 'timestamptz', name: 'consented_at', nullable: true })
  consentedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'rejected_at', nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'exchanged_at', nullable: true })
  exchangedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
