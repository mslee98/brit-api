import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { NotificationDomainException } from './exceptions/notification.exceptions';
import { UserPushSubscriptionEntity } from './infrastructure/entities/user-push-subscription.entity';

@Injectable()
export class PushSubscriptionService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserPushSubscriptionEntity)
    private readonly subscriptionRepository: Repository<UserPushSubscriptionEntity>,
  ) {}

  getVapidPublicKey(): { enabled: boolean; publicKey?: string } {
    const details = this.getVapidDetails();
    if (!details) {
      return { enabled: false };
    }
    return { enabled: true, publicKey: details.publicKey };
  }

  getVapidDetails(): {
    publicKey: string;
    privateKey: string;
    subject: string;
  } | null {
    const publicKey = this.readEnv('VAPID_PUBLIC_KEY');
    const privateKey = this.readEnv('VAPID_PRIVATE_KEY');
    const subject = this.readEnv('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
      return null;
    }
    return { publicKey, privateKey, subject };
  }

  hasVapidConfig(): boolean {
    return this.getVapidDetails() !== null;
  }

  private readEnv(name: string): string | undefined {
    const value = this.configService.get<string>(name)?.trim();
    return value ? value : undefined;
  }

  async upsertSubscription(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  }): Promise<{ id: string; endpoint: string }> {
    if (!this.hasVapidConfig()) {
      throw NotificationDomainException.pushNotConfigured();
    }

    const existing = await this.subscriptionRepository.findOne({
      where: { endpoint: input.endpoint },
    });
    if (existing) {
      existing.userId = input.userId;
      existing.p256dh = input.p256dh;
      existing.auth = input.auth;
      existing.userAgent = input.userAgent;
      const saved = await this.subscriptionRepository.save(existing);
      return { id: saved.id, endpoint: saved.endpoint };
    }

    try {
      const saved = await this.subscriptionRepository.save(
        this.subscriptionRepository.create({
          userId: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        }),
      );
      return { id: saved.id, endpoint: saved.endpoint };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        const raced = await this.subscriptionRepository.findOne({
          where: { endpoint: input.endpoint },
        });
        if (raced) {
          raced.userId = input.userId;
          raced.p256dh = input.p256dh;
          raced.auth = input.auth;
          raced.userAgent = input.userAgent;
          const saved = await this.subscriptionRepository.save(raced);
          return { id: saved.id, endpoint: saved.endpoint };
        }
      }
      throw error;
    }
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<void> {
    const existing = await this.subscriptionRepository.findOne({
      where: { endpoint },
    });
    if (!existing || existing.userId !== userId) {
      throw NotificationDomainException.pushSubscriptionNotFound();
    }
    await this.subscriptionRepository.remove(existing);
  }

  async findByUserId(userId: string): Promise<UserPushSubscriptionEntity[]> {
    return this.subscriptionRepository.find({ where: { userId } });
  }

  async deleteById(id: string): Promise<void> {
    await this.subscriptionRepository.delete({ id });
  }
}
