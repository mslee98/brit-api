import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { UserCoinLotEntity } from '../../../coins/infrastructure/entities/user-coin-lot.entity';
import { PartnerExchangeEntity } from './partner-exchange.entity';

/**
 * partner_exchange_coin_lots — CHARGE 잠금 시 사용자 Lot 할당 (B4-1).
 * unlock/consume 시 근거.
 */
@Entity({ name: 'partner_exchange_coin_lots' })
@Unique('ux_partner_exchange_coin_lots_exchange_lot', [
  'partnerExchangeId',
  'coinLotId',
])
@Index('ix_partner_exchange_coin_lots_exchange', ['partnerExchangeId'])
export class PartnerExchangeCoinLotEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_exchange_id' })
  partnerExchangeId!: string;

  @ManyToOne(() => PartnerExchangeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity;

  @Column({ type: 'uuid', name: 'coin_lot_id' })
  coinLotId!: string;

  @ManyToOne(() => UserCoinLotEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coin_lot_id', referencedColumnName: 'id' })
  coinLot!: UserCoinLotEntity;

  /** 이 Exchange에 잠긴 금액 (MS) */
  @Column({ type: 'bigint', name: 'locked_amount' })
  lockedAmount!: string;

  /** 아직 해제·소비되지 않은 잠금 잔량 */
  @Column({ type: 'bigint', name: 'remaining_locked_amount' })
  remainingLockedAmount!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
