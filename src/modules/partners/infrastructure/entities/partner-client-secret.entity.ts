import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PartnerClientSecretStatus } from '../../domain/enums/partner-client-secret-status.enum';
import { PartnerClientSecretType } from '../../domain/enums/partner-client-secret-type.enum';
import { PartnerClientEntity } from './partner-client.entity';

@Entity({ name: 'partner_client_secrets' })
@Index('ix_partner_client_secrets_client_status', [
  'partnerClientId',
  'status',
])
export class PartnerClientSecretEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_client_id' })
  partnerClientId!: string;

  @ManyToOne(() => PartnerClientEntity, (client) => client.secrets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity;

  @Column({ type: 'varchar', length: 30, name: 'secret_type' })
  secretType!: PartnerClientSecretType;

  @Column({ type: 'varchar', length: 255, name: 'secret_hash' })
  secretHash!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerClientSecretStatus.ACTIVE,
  })
  status!: PartnerClientSecretStatus;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;
}
