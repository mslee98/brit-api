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
import { PartnerExchangeStatus } from '../../domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from '../../domain/enums/partner-exchange-type.enum';
import { PartnerAssetEntity } from './partner-asset.entity';
import { PartnerClientEntity } from './partner-client.entity';
import { PartnerEntity } from './partner.entity';
import { UserPartnerLinkEntity } from './user-partner-link.entity';

/**
 * partner_exchanges — CHARGE/REDEEM 전환 원장.
 */
@Entity({ name: 'partner_exchanges' })
@Index('ux_partner_exchanges_exchange_number', ['exchangeNumber'], {
  unique: true,
})
@Index('ux_partner_exchanges_partner_idempotency', ['partnerId', 'idempotencyKey'], {
  unique: true,
})
@Index('ix_partner_exchanges_partner_status_requested', [
  'partnerId',
  'status',
  'requestedAt',
])
@Index('ix_partner_exchanges_user_requested', ['userId', 'requestedAt'])
export class PartnerExchangeEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 40, name: 'exchange_number' })
  exchangeNumber!: string;

  @Column({ type: 'varchar', length: 100, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ type: 'uuid', name: 'user_partner_link_id' })
  userPartnerLinkId!: string;

  @ManyToOne(() => UserPartnerLinkEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_partner_link_id', referencedColumnName: 'id' })
  userPartnerLink!: UserPartnerLinkEntity;

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

  @Column({ type: 'uuid', name: 'partner_asset_id' })
  partnerAssetId!: string;

  @ManyToOne(() => PartnerAssetEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_asset_id', referencedColumnName: 'id' })
  partnerAsset!: PartnerAssetEntity;

  @Column({ type: 'uuid', name: 'partner_client_id', nullable: true })
  partnerClientId!: string | null;

  @ManyToOne(() => PartnerClientEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity | null;

  @Column({ type: 'varchar', length: 20, name: 'exchange_type' })
  exchangeType!: PartnerExchangeType;

  @Column({ type: 'bigint', name: 'amount' })
  amount!: string;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'status',
    default: PartnerExchangeStatus.REQUESTED,
  })
  status!: PartnerExchangeStatus;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'partner_transaction_id',
    nullable: true,
  })
  partnerTransactionId!: string | null;

  @Column({ type: 'timestamptz', name: 'requested_at', default: () => 'now()' })
  requestedAt!: Date;

  @Column({ type: 'timestamptz', name: 'asset_locked_at', nullable: true })
  assetLockedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'partner_processing_at', nullable: true })
  partnerProcessingAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'failed_at', nullable: true })
  failedAt!: Date | null;

  @Column({ type: 'varchar', length: 100, name: 'failure_code', nullable: true })
  failureCode!: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'failure_message',
    nullable: true,
  })
  failureMessage!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
