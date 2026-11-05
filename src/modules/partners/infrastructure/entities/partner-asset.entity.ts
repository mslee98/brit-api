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

import { PartnerEntity } from './partner.entity';

/**
 * partner_assets — 업체 자산(포인트 등) 및 환산비.
 */
@Entity({ name: 'partner_assets' })
@Index('ux_partner_assets_partner_code', ['partnerId', 'assetCode'], {
  unique: true,
})
export class PartnerAssetEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'varchar', length: 30, name: 'asset_code' })
  assetCode!: string;

  @Column({ type: 'varchar', length: 100, name: 'asset_name' })
  assetName!: string;

  @Column({ type: 'varchar', length: 30, name: 'asset_type', default: 'POINT' })
  assetType!: string;

  @Column({
    type: 'bigint',
    name: 'exchange_rate_numerator',
    default: 1,
  })
  exchangeRateNumerator!: string;

  @Column({
    type: 'bigint',
    name: 'exchange_rate_denominator',
    default: 1,
  })
  exchangeRateDenominator!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
