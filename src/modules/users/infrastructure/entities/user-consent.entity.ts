import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';

import { UserEntity } from './user.entity';

@Entity({ name: 'user_consents' })
export class UserConsentEntity {
  @PrimaryColumn({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @OneToOne(() => UserEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'boolean',
    name: 'service',
  })
  service!: boolean;

  @Column({
    type: 'boolean',
    name: 'privacy',
  })
  privacy!: boolean;

  @Column({
    type: 'boolean',
    name: 'identity',
  })
  identity!: boolean;

  @Column({
    type: 'boolean',
    name: 'marketing',
    default: false,
  })
  marketing!: boolean;

  @Column({
    type: 'timestamptz',
    name: 'agreed_at',
  })
  agreedAt!: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;
}
