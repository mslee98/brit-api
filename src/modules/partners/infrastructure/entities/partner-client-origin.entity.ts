import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { PartnerClientEntity } from './partner-client.entity';

@Entity({ name: 'partner_client_origins' })
export class PartnerClientOriginEntity {
  @PrimaryColumn({ type: 'uuid', name: 'partner_client_id' })
  partnerClientId!: string;

  @PrimaryColumn({ type: 'varchar', length: 255, name: 'origin' })
  origin!: string;

  @ManyToOne(() => PartnerClientEntity, (client) => client.origins, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity;
}
