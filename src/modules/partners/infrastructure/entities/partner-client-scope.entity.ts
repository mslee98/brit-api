import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { PartnerClientScopeCode } from '../../domain/enums/partner-client-scope-code.enum';
import { PartnerClientEntity } from './partner-client.entity';

@Entity({ name: 'partner_client_scopes' })
export class PartnerClientScopeEntity {
  @PrimaryColumn({ type: 'uuid', name: 'partner_client_id' })
  partnerClientId!: string;

  @PrimaryColumn({ type: 'varchar', length: 40, name: 'scope_code' })
  scopeCode!: PartnerClientScopeCode;

  @ManyToOne(() => PartnerClientEntity, (client) => client.scopes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partner_client_id', referencedColumnName: 'id' })
  partnerClient!: PartnerClientEntity;
}
