import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../../../users/infrastructure/entities/user.entity';
import { CoinLedgerEntryType } from '../../domain/enums/coin-ledger-entry-type.enum';
import { UserCoinLotEntity } from './user-coin-lot.entity';

/**
 * coin_ledger_entries — 사용자 Coin 불변 원장.
 * 기존 행 UPDATE/DELETE 금지. (transaction_id, sequence_no) UNIQUE.
 */
@Entity({ name: 'coin_ledger_entries' })
@Index('ux_coin_ledger_entries_tx_seq', ['transactionId', 'sequenceNo'], {
  unique: true,
})
@Index('ix_coin_ledger_entries_user_created', ['userId', 'createdAt'])
@Index('ix_coin_ledger_entries_reference', ['referenceType', 'referenceId'])
@Index('ux_coin_ledger_entries_trade_entry', ['referenceType', 'referenceId', 'entryType'], {
  unique: true,
  where: `"reference_type" = 'TRADE'`,
})
export class CoinLedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transactionId!: string;

  @Column({ type: 'smallint', name: 'sequence_no' })
  sequenceNo!: number;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'uuid', name: 'coin_lot_id', nullable: true })
  coinLotId!: string | null;

  @ManyToOne(() => UserCoinLotEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'coin_lot_id', referencedColumnName: 'id' })
  coinLot!: UserCoinLotEntity | null;

  @Column({
    type: 'enum',
    enum: CoinLedgerEntryType,
    enumName: 'coin_ledger_entry_type',
    name: 'entry_type',
  })
  entryType!: CoinLedgerEntryType;

  @Column({ type: 'bigint', name: 'non_sellable_delta', default: 0 })
  nonSellableDelta!: string;

  @Column({ type: 'bigint', name: 'sellable_delta', default: 0 })
  sellableDelta!: string;

  @Column({ type: 'bigint', name: 'locked_non_sellable_delta', default: 0 })
  lockedNonSellableDelta!: string;

  @Column({ type: 'bigint', name: 'locked_sellable_delta', default: 0 })
  lockedSellableDelta!: string;

  @Column({ type: 'varchar', length: 50, name: 'reference_type' })
  referenceType!: string;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'description', nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
