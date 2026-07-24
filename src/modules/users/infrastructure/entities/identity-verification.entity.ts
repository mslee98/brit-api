import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { IdentityVerificationProvider } from '../../domain/enums/identity-verification-provider.enum';
import { UserEntity } from './user.entity';

@Entity({ name: 'identity_verifications' })
@Index('ux_identity_verifications_request_id', ['requestId'], {
  unique: true,
  where: '"request_id" IS NOT NULL',
})
@Index('ix_identity_verifications_user_id', ['userId'])
export class IdentityVerificationEntity {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
  })
  id!: string;

  @Column({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @ManyToOne(() => UserEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'enum',
    enum: IdentityVerificationProvider,
    enumName: 'identity_verification_provider',
    name: 'provider',
  })
  provider!: IdentityVerificationProvider;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'request_id',
    nullable: true,
  })
  requestId!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'phone_e164',
  })
  phoneE164!: string;

  @Column({
    type: 'timestamptz',
    name: 'verified_at',
  })
  verifiedAt!: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;
}
