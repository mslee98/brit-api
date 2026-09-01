import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationOutboxController } from './admin-notification-outbox.controller';
import { NotificationEventEntity } from './infrastructure/entities/notification-event.entity';
import { NotificationOutboxEntity } from './infrastructure/entities/notification-outbox.entity';
import { NotificationRecipientEntity } from './infrastructure/entities/notification-recipient.entity';
import { UserPushSubscriptionEntity } from './infrastructure/entities/user-push-subscription.entity';
import { NotificationOutboxWorker } from './notification-outbox.worker';
import { NotificationStreamService } from './notification-stream.service';
import { NotificationService } from './notification.service';
import { PushSubscriptionController } from './push-subscription.controller';
import { PushSubscriptionService } from './push-subscription.service';
import { UserNotificationsController } from './user-notifications.controller';

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
  controllers: [
    AdminNotificationsController,
    AdminNotificationOutboxController,
    PushSubscriptionController,
    UserNotificationsController,
  ],
  providers: [
    NotificationService,
    NotificationStreamService,
    PushSubscriptionService,
    NotificationOutboxWorker,
  ],
  exports: [NotificationService, PushSubscriptionService, NotificationStreamService],
})
export class NotificationsModule {}
