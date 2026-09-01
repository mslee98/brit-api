import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';

import { resolveAssetRootPath } from './common/utils/asset-root-path.util';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminsModule } from './modules/admins/admins.module';
import { BanksModule } from './modules/banks/banks.module';
import { CoinsModule } from './modules/coins/coins.module';
import { MarketModule } from './modules/market/market.module';
import { MatchingModule } from './modules/matching/matching.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TradesModule } from './modules/trades/trades.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: join(
            resolveAssetRootPath(config.get<string>('ASSET_ROOT_PATH')),
            'assets',
          ),
          serveRoot: '/assets',
        },
      ],
    }),
    DatabaseModule,
    HealthModule,
    UsersModule,
    AdminsModule,
    BanksModule,
    NotificationsModule,
    CoinsModule,
    TradesModule,
    MatchingModule,
    OrdersModule,
    MarketModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
