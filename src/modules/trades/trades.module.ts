import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { BanksModule } from '../banks/banks.module';
import { CoinsModule } from '../coins/coins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BuyOrderEntity } from '../orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../orders/infrastructure/entities/matching-policy.entity';
import { OrderNumberSequenceEntity } from '../orders/infrastructure/entities/order-number-sequence.entity';
import { SellOrderCoinLotEntity } from '../orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { UsersModule } from '../users/users.module';
import { AdminDisputesController } from './admin-disputes.controller';
import { AdminTradesController } from './admin-trades.controller';
import { DisputesController } from './disputes.controller';
import { TradeCoinLotEntity } from './infrastructure/entities/trade-coin-lot.entity';
import { TradeDisputeActionEntity } from './infrastructure/entities/trade-dispute-action.entity';
import { TradeDisputeEntity } from './infrastructure/entities/trade-dispute.entity';
import { TradeEventEntity } from './infrastructure/entities/trade-event.entity';
import { TradeEntity } from './infrastructure/entities/trade.entity';
import { DisputeGateway } from './realtime/dispute.gateway';
import { DisputeRealtimePublisher } from './realtime/dispute-realtime.publisher';
import { TradeGateway } from './realtime/trade.gateway';
import { TradeRealtimePublisher } from './realtime/trade-realtime.publisher';
import { DisputeEvidenceStorage } from './dispute-evidence.storage';
import { TradeService } from './trade.service';
import { TradeWorker } from './trade.worker';
import { TradesController } from './trades.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TradeEntity,
      TradeCoinLotEntity,
      TradeEventEntity,
      TradeDisputeEntity,
      TradeDisputeActionEntity,
      OrderNumberSequenceEntity,
      BuyOrderEntity,
      MatchingPolicyEntity,
      SellOrderEntity,
      SellOrderCoinLotEntity,
    ]),
    AuthGuardsModule,
    CoinsModule,
    UsersModule,
    BanksModule,
    NotificationsModule,
    forwardRef(() => AdminsModule),
  ],
  controllers: [
    TradesController,
    AdminTradesController,
    AdminDisputesController,
    DisputesController,
  ],
  providers: [
    TradeService,
    TradeWorker,
    DisputeRealtimePublisher,
    DisputeGateway,
    TradeRealtimePublisher,
    TradeGateway,
    DisputeEvidenceStorage,
  ],
  exports: [TradeService],
})
export class TradesModule {}
