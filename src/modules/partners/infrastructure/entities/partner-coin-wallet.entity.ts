import {
  Check,
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
 * partner_coin_wallets — 업체 MS 잔액. available은 -credit_limit까지 음수 허용.
 */
@Entity({ name: 'partner_coin_wallets' })
@Check('ck_partner_coin_wallets_credit_limit', '"credit_limit" >= 0')
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

  /** 업체별 마이너스 한도. 0이면 음수 잔액이 되는 REDEEM을 거절한다. */
  @Column({ type: 'bigint', name: 'credit_limit', default: 0 })
  creditLimit!: string;

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
