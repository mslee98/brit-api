import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SellOrderEntity } from '../orders/infrastructure/entities/sell-order.entity';
import { UserProfileEntity } from '../users/infrastructure/entities/user-profile.entity';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

/**
 * 거래소 조회 전용 모듈. Read-only.
 * OrdersModule / MatchingModule을 import하지 않는다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SellOrderEntity, UserProfileEntity]),
  ],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
