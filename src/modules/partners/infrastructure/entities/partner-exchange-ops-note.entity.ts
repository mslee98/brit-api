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
import { PartnerExchangeOpsNoteAction } from '../../domain/enums/partner-exchange-ops-note-action.enum';
import { PartnerExchangeEntity } from './partner-exchange.entity';

/**
 * partner_exchange_ops_notes — B4-6 운영 대사 메모·조치 기록.
 * 자산 변경은 settle만 수행한다.
 */
@Entity({ name: 'partner_exchange_ops_notes' })
@Index('ix_partner_exchange_ops_notes_exchange_created', [
  'partnerExchangeId',
  'createdAt',
])
export class PartnerExchangeOpsNoteEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_exchange_id' })
  partnerExchangeId!: string;

  @ManyToOne(() => PartnerExchangeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_exchange_id', referencedColumnName: 'id' })
  partnerExchange!: PartnerExchangeEntity;

  @Column({ type: 'uuid', name: 'author_user_id' })
  authorUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_user_id', referencedColumnName: 'id' })
  authorUser!: UserEntity;

  @Column({ type: 'varchar', length: 1000, name: 'note' })
  note!: string;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'action',
    default: PartnerExchangeOpsNoteAction.NOTE,
  })
  action!: PartnerExchangeOpsNoteAction;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
