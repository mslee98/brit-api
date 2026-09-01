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

@Entity({ name: 'user_push_subscriptions' })
@Index('ux_user_push_subscriptions_endpoint', ['endpoint'], { unique: true })
@Index('ix_user_push_subscriptions_user_id', ['userId'])
export class UserPushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 2048, name: 'endpoint' })
  endpoint!: string;

  @Column({ type: 'varchar', length: 255, name: 'p256dh' })
  p256dh!: string;

  @Column({ type: 'varchar', length: 255, name: 'auth' })
  auth!: string;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
