import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PartnerClientEnvironment } from '../../domain/enums/partner-client-environment.enum';
import { PartnerClientStatus } from '../../domain/enums/partner-client-status.enum';
import { PartnerClientType } from '../../domain/enums/partner-client-type.enum';
import { PartnerEntity } from './partner.entity';
import { PartnerClientOriginEntity } from './partner-client-origin.entity';
import { PartnerClientScopeEntity } from './partner-client-scope.entity';
import { PartnerClientSecretEntity } from './partner-client-secret.entity';

/**
 * partner_clients — SDK/API Client (스키마만, 발급 API는 후속).
 */
@Entity({ name: 'partner_clients' })
@Index('ux_partner_clients_client_id', ['clientId'], { unique: true })
@Index('ix_partner_clients_partner_status', ['partnerId', 'status'])
export class PartnerClientEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'partner_id' })
  partnerId!: string;

  @ManyToOne(() => PartnerEntity, (partner) => partner.clients, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'id' })
  partner!: PartnerEntity;

  @Column({ type: 'varchar', length: 64, name: 'client_id' })
  clientId!: string;

  @Column({ type: 'varchar', length: 20, name: 'client_type' })
  clientType!: PartnerClientType;

  @Column({ type: 'varchar', length: 20, name: 'environment' })
  environment!: PartnerClientEnvironment;

  @Column({ type: 'varchar', length: 100, name: 'name' })
  name!: string;

  @Column({ type: 'varchar', length: 500, name: 'webhook_url', nullable: true })
  webhookUrl!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerClientStatus.ACTIVE,
  })
  status!: PartnerClientStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PartnerClientSecretEntity, (secret) => secret.partnerClient)
  secrets!: PartnerClientSecretEntity[];

  @OneToMany(() => PartnerClientScopeEntity, (scope) => scope.partnerClient)
  scopes!: PartnerClientScopeEntity[];

  @OneToMany(() => PartnerClientOriginEntity, (origin) => origin.partnerClient)
  origins!: PartnerClientOriginEntity[];
}
