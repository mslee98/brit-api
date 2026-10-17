import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../orders/infrastructure/entities/matching-policy.entity';
import { SellOrderCoinLotEntity } from '../orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { TradesModule } from '../trades/trades.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminMatchingController } from './admin-matching.controller';
import { MatchingAttemptEntity } from './infrastructure/entities/matching-attempt.entity';
import { TradeRequestEntity } from './infrastructure/entities/trade-request.entity';
import { MatchingService } from './matching.service';
import { MatchingWorker } from './matching.worker';
import { TradeRequestController } from './trade-request.controller';
import { TradeRequestReservationService } from './trade-request-reservation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BuyOrderEntity,
      SellOrderEntity,
      SellOrderCoinLotEntity,
      MatchingPolicyEntity,
      MatchingAttemptEntity,
      TradeRequestEntity,
    ]),
    AuthGuardsModule,
    AdminsModule,
    UsersModule,
    TradesModule,
    forwardRef(() => OrdersModule),
    NotificationsModule,
  ],
  controllers: [AdminMatchingController, TradeRequestController],
  providers: [
    MatchingService,
    MatchingWorker,
    TradeRequestReservationService,
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
