import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PartnerCoinLedgerEntryType } from '../../domain/enums/partner-coin-ledger-entry-type.enum';
import { PartnerEntity } from './partner.entity';

/**
 * partner_coin_ledger_entries — 업체 Coin 불변 원장.
 */
@Entity({ name: 'partner_coin_ledger_entries' })
@Index('ux_partner_coin_ledger_tx_seq', ['transactionId', 'sequenceNo'], {
  unique: true,
})
@Index('ix_partner_coin_ledger_partner_created', ['partnerId', 'createdAt'])
@Index('ix_partner_coin_ledger_reference', ['referenceType', 'referenceId'])
export class PartnerCoinLedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transactionId!: string;

  @Column({ type: 'smallint', name: 'sequence_no' })
  sequenceNo!: number;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'varchar', length: 40, name: 'entry_type' })
  entryType!: PartnerCoinLedgerEntryType;

  @Column({ type: 'bigint', name: 'available_delta' })
  availableDelta!: string;

  @Column({ type: 'bigint', name: 'locked_delta', default: 0 })
  lockedDelta!: string;

  @Column({ type: 'varchar', length: 40, name: 'reference_type' })
  referenceType!: string;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'description', nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
