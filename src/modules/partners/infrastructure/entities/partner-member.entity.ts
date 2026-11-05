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
import { PartnerMemberRole } from '../../domain/enums/partner-member-role.enum';
import { PartnerMemberStatus } from '../../domain/enums/partner-member-status.enum';
import { PartnerEntity } from './partner.entity';

/**
 * partner_members — 업체 담당자(Brit 사용자) 연결.
 * ACTIVE 소속은 사용자당 1개 (partial unique).
 */
@Entity({ name: 'partner_members' })
@Index('ix_partner_members_partner_status', ['partnerId', 'status'])
@Index('ix_partner_members_user_status', ['userId', 'status'])
export class PartnerMemberEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, (partner) => partner.members, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 20, name: 'role' })
  role!: PartnerMemberRole;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerMemberStatus.ACTIVE,
  })
  status!: PartnerMemberStatus;

  @Column({ type: 'uuid', name: 'invited_by_user_id', nullable: true })
  invitedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by_user_id', referencedColumnName: 'id' })
  invitedByUser!: UserEntity | null;

  @Column({ type: 'timestamptz', name: 'joined_at', nullable: true })
  joinedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'removed_at', nullable: true })
  removedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
