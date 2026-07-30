import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationEventEntity } from './infrastructure/entities/notification-event.entity';
import { NotificationRecipientEntity } from './infrastructure/entities/notification-recipient.entity';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEventEntity,
      NotificationRecipientEntity,
    ]),
    AuthGuardsModule,
  ],
  controllers: [AdminNotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
