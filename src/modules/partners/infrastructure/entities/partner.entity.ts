import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PartnerStatus } from '../../domain/enums/partner-status.enum';
import { PartnerClientEntity } from './partner-client.entity';
import { PartnerMemberEntity } from './partner-member.entity';

/**
 * partners — 제휴 업체 루트.
 * 관리자 등록 즉시 ACTIVE. 사업자등록번호는 MVP에서 두지 않는다.
 */
@Entity({ name: 'partners' })
@Index('ux_partners_code', ['code'], { unique: true })
@Index('ix_partners_status', ['status'])
export class PartnerEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 30, name: 'code' })
  code!: string;

  @Column({ type: 'varchar', length: 100, name: 'name' })
  name!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: PartnerStatus.ACTIVE,
  })
  status!: PartnerStatus;

  @Column({ type: 'varchar', length: 50, name: 'contact_name' })
  contactName!: string;

  @Column({ type: 'varchar', length: 30, name: 'contact_phone' })
  contactPhone!: string;

  @Column({ type: 'varchar', length: 100, name: 'contact_email' })
  contactEmail!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'contact_telegram',
    nullable: true,
  })
  contactTelegram!: string | null;

  @Column({ type: 'text', name: 'memo', nullable: true })
  memo!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PartnerMemberEntity, (member) => member.partner)
  members!: PartnerMemberEntity[];

  @OneToMany(() => PartnerClientEntity, (client) => client.partner)
  clients!: PartnerClientEntity[];
}
