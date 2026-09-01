import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AdminsModule } from '../admins/admins.module';
import { CoinsModule } from '../coins/coins.module';
import { MatchingModule } from '../matching/matching.module';
import { UsersModule } from '../users/users.module';
import { AdminMatchingPolicyController } from './admin-matching-policy.controller';
import { AdminOrderService } from './admin-order.service';
import { AdminOrdersController } from './admin-orders.controller';
import { BuyOrderController } from './buy-order.controller';
import { BuyOrderService } from './buy-order.service';
import { MatchingPolicyService } from './matching-policy.service';
import { BuyOrderEntity } from './infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from './infrastructure/entities/matching-policy.entity';
import { OrderNumberSequenceEntity } from './infrastructure/entities/order-number-sequence.entity';
import { SellOrderCoinLotEntity } from './infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from './infrastructure/entities/sell-order.entity';
import { SellOrderController } from './sell-order.controller';
import { SellOrderService } from './sell-order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchingPolicyEntity,
      OrderNumberSequenceEntity,
      BuyOrderEntity,
      SellOrderEntity,
      SellOrderCoinLotEntity,
    ]),
    AuthGuardsModule,
    CoinsModule,
    UsersModule,
    forwardRef(() => MatchingModule),
    forwardRef(() => AdminsModule),
  ],
  controllers: [
    BuyOrderController,
    SellOrderController,
    AdminOrdersController,
    AdminMatchingPolicyController,
  ],
  providers: [
    BuyOrderService,
    SellOrderService,
    AdminOrderService,
    MatchingPolicyService,
  ],
  exports: [BuyOrderService, SellOrderService],
})
export class OrdersModule {}
