import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { PartnerCoinWalletStatus } from '../../domain/enums/partner-coin-wallet-status.enum';
import { PartnerEntity } from './partner.entity';

/**
 * partner_coin_wallets — 업체 MS 잔액 (음수 available 허용).
 */
@Entity({ name: 'partner_coin_wallets' })
export class PartnerCoinWalletEntity {
  @PrimaryColumn({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @OneToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'bigint', name: 'available_balance', default: 0 })
  availableBalance!: string;

  @Column({ type: 'bigint', name: 'locked_balance', default: 0 })
  lockedBalance!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerCoinWalletStatus.ACTIVE,
  })
  status!: PartnerCoinWalletStatus;

  @VersionColumn({ type: 'bigint', name: 'version', default: 0 })
  version!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
