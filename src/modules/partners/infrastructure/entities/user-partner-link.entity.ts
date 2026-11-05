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
import { UserPartnerLinkStatus } from '../../domain/enums/user-partner-link-status.enum';
import { PartnerEntity } from './partner.entity';

/**
 * user_partner_links — 최종 사용자 ↔ 업체 연결 (CHARGE/REDEEM 전제).
 */
@Entity({ name: 'user_partner_links' })
@Index('ux_user_partner_links_partner_user_key', ['partnerId', 'partnerUserKey'], {
  unique: true,
})
export class UserPartnerLinkEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'varchar', length: 255, name: 'partner_user_key' })
  partnerUserKey!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: UserPartnerLinkStatus.ACTIVE,
  })
  status!: UserPartnerLinkStatus;

  @Column({ type: 'timestamptz', name: 'linked_at', default: () => 'now()' })
  linkedAt!: Date;

  @Column({ type: 'timestamptz', name: 'unlinked_at', nullable: true })
  unlinkedAt!: Date | null;

  @Column({ type: 'uuid', name: 'exception_approved_by_user_id', nullable: true })
  exceptionApprovedByUserId!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'exception_reason', nullable: true })
  exceptionReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
