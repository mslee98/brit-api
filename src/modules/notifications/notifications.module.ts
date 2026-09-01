import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationEventEntity } from './infrastructure/entities/notification-event.entity';
import { NotificationOutboxEntity } from './infrastructure/entities/notification-outbox.entity';
import { NotificationRecipientEntity } from './infrastructure/entities/notification-recipient.entity';
import { UserPushSubscriptionEntity } from './infrastructure/entities/user-push-subscription.entity';
import { NotificationOutboxWorker } from './notification-outbox.worker';
import { NotificationService } from './notification.service';
import { PushSubscriptionController } from './push-subscription.controller';
import { PushSubscriptionService } from './push-subscription.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEventEntity,
      NotificationRecipientEntity,
      NotificationOutboxEntity,
      UserPushSubscriptionEntity,
    ]),
    AuthGuardsModule,
    forwardRef(() => AdminsModule),
  ],
  controllers: [AdminNotificationsController, PushSubscriptionController],
  providers: [
    NotificationService,
    PushSubscriptionService,
    NotificationOutboxWorker,
  ],
  exports: [NotificationService, PushSubscriptionService],
})
export class NotificationsModule {}
