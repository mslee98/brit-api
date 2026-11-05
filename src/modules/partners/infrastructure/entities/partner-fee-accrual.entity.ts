import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PartnerExchangeType } from '../../domain/enums/partner-exchange-type.enum';
import { PartnerFeeAccrualStatus } from '../../domain/enums/partner-fee-accrual-status.enum';
import { PartnerExchangeEntity } from './partner-exchange.entity';
import { PartnerFeePolicyEntity } from './partner-fee-policy.entity';
import { PartnerEntity } from './partner.entity';

/**
 * partner_fee_accruals — 전환 건별 수수료 발생 스냅샷.
 */
@Entity({ name: 'partner_fee_accruals' })
@Index('ux_partner_fee_accruals_exchange', ['partnerExchangeId'], {
  unique: true,
})
@Index('ix_partner_fee_accruals_partner_accrued', ['partnerId', 'accruedAt'])
export class PartnerFeeAccrualEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'uuid', name: 'partner_exchange_id' })
  partnerExchangeId!: string;

  @ManyToOne(() => PartnerExchangeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity;

  @Column({ type: 'uuid', name: 'fee_policy_id' })
  feePolicyId!: string;

  @ManyToOne(() => PartnerFeePolicyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fee_policy_id', referencedColumnName: 'id' })
  feePolicy!: PartnerFeePolicyEntity;

  @Column({ type: 'varchar', length: 20, name: 'exchange_type' })
  exchangeType!: PartnerExchangeType;

  @Column({ type: 'bigint', name: 'gross_amount' })
  grossAmount!: string;

  @Column({ type: 'int', name: 'fee_rate_bps' })
  feeRateBps!: number;

  @Column({ type: 'bigint', name: 'fixed_fee_amount' })
  fixedFeeAmount!: string;

  @Column({ type: 'bigint', name: 'percentage_fee_amount' })
  percentageFeeAmount!: string;

  @Column({ type: 'bigint', name: 'total_fee_amount' })
  totalFeeAmount!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerFeeAccrualStatus.ACCRUED,
  })
  status!: PartnerFeeAccrualStatus;

  @Column({ type: 'timestamptz', name: 'accrued_at', default: () => 'now()' })
  accruedAt!: Date;

  @Column({ type: 'timestamptz', name: 'settled_at', nullable: true })
  settledAt!: Date | null;
}
