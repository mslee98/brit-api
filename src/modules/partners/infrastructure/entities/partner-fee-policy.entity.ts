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
import { FeeRoundingRule } from '../../domain/enums/fee-rounding-rule.enum';
import { FeeSettlementCycle } from '../../domain/enums/fee-settlement-cycle.enum';
import { PartnerFeeTarget } from '../../domain/enums/partner-fee-target.enum';
import { PartnerEntity } from './partner.entity';

/**
 * partner_fee_policies — 업체 수수료 정책 (유효기간 스냅샷 원본).
 */
@Entity({ name: 'partner_fee_policies' })
@Index('ix_partner_fee_policies_partner_active', [
  'partnerId',
  'isActive',
  'effectiveFrom',
])
export class PartnerFeePolicyEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'varchar', length: 20, name: 'fee_target' })
  feeTarget!: PartnerFeeTarget;

  @Column({ type: 'int', name: 'fee_rate_bps', default: 0 })
  feeRateBps!: number;

  @Column({ type: 'bigint', name: 'fixed_fee_amount', default: 0 })
  fixedFeeAmount!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'rounding_rule',
    default: FeeRoundingRule.FLOOR,
  })
  roundingRule!: FeeRoundingRule;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'settlement_cycle',
    default: FeeSettlementCycle.WEEKLY,
  })
  settlementCycle!: FeeSettlementCycle;

  @Column({ type: 'smallint', name: 'settlement_weekday', nullable: true })
  settlementWeekday!: number | null;

  @Column({ type: 'smallint', name: 'payment_due_days', default: 3 })
  paymentDueDays!: number;

  @Column({ type: 'timestamptz', name: 'effective_from' })
  effectiveFrom!: Date;

  @Column({ type: 'timestamptz', name: 'effective_to', nullable: true })
  effectiveTo!: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'created_by_user_id' })
  createdByUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id', referencedColumnName: 'id' })
  createdByUser!: UserEntity;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
