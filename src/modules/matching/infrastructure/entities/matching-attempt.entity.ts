import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BuyOrderEntity } from '../../../orders/infrastructure/entities/buy-order.entity';
import { SellOrderEntity } from '../../../orders/infrastructure/entities/sell-order.entity';
import { MatchingAttemptReasonCode } from '../../domain/enums/matching-attempt-reason-code.enum';
import { MatchingAttemptResult } from '../../domain/enums/matching-attempt-result.enum';
import { TradeEntity } from '../../../trades/infrastructure/entities/trade.entity';

/**
 * matching_attempts — 매칭 시도 로그 (성공/실패 모두).
 */
@Entity({ name: 'matching_attempts' })
@Index('ix_matching_attempts_buy_attempted', ['buyOrderId', 'attemptedAt'])
@Index('ix_matching_attempts_trade_id', ['tradeId'])
export class MatchingAttemptEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'buy_order_id' })
  buyOrderId!: string;

  @ManyToOne(() => BuyOrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buy_order_id', referencedColumnName: 'id' })
  buyOrder!: BuyOrderEntity;

  @Column({ type: 'uuid', name: 'sell_order_id', nullable: true })
  sellOrderId!: string | null;

  @ManyToOne(() => SellOrderEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sell_order_id', referencedColumnName: 'id' })
  sellOrder!: SellOrderEntity | null;

  @Column({
    type: 'enum',
    enum: MatchingAttemptResult,
    enumName: 'matching_attempt_result',
    name: 'result',
  })
  result!: MatchingAttemptResult;

  @Column({ type: 'uuid', name: 'trade_id', nullable: true })
  tradeId!: string | null;

  @ManyToOne(() => TradeEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'trade_id', referencedColumnName: 'id' })
  trade!: TradeEntity | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'reason_code',
    nullable: true,
  })
  reasonCode!: MatchingAttemptReasonCode | string | null;

  @Column({ type: 'timestamptz', name: 'attempted_at' })
  attemptedAt!: Date;
}
