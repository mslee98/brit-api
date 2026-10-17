import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserSessionEntity } from '../modules/auth/infrastructure/entities/user-session.entity';
import { AdminProfileEntity } from '../modules/admins/infrastructure/entities/admin-profile.entity';
import { AuditLogEntity } from '../modules/admins/infrastructure/entities/audit-log.entity';
import { BankEntity } from '../modules/banks/infrastructure/entities/bank.entity';
import { CoinLedgerEntryEntity } from '../modules/coins/infrastructure/entities/coin-ledger-entry.entity';
import { CoinPurchaseEntity } from '../modules/coins/infrastructure/entities/coin-purchase.entity';
import { AdminCoinAdjustmentRequestEntity } from '../modules/coins/infrastructure/entities/admin-coin-adjustment-request.entity';
import { UserCoinLotEntity } from '../modules/coins/infrastructure/entities/user-coin-lot.entity';
import { UserCoinWalletEntity } from '../modules/coins/infrastructure/entities/user-coin-wallet.entity';
import { NotificationEventEntity } from '../modules/notifications/infrastructure/entities/notification-event.entity';
import { NotificationOutboxEntity } from '../modules/notifications/infrastructure/entities/notification-outbox.entity';
import { NotificationRecipientEntity } from '../modules/notifications/infrastructure/entities/notification-recipient.entity';
import { UserPushSubscriptionEntity } from '../modules/notifications/infrastructure/entities/user-push-subscription.entity';
import { MatchingAttemptEntity } from '../modules/matching/infrastructure/entities/matching-attempt.entity';
import { TradeRequestEntity } from '../modules/matching/infrastructure/entities/trade-request.entity';
import { BuyOrderEntity } from '../modules/orders/infrastructure/entities/buy-order.entity';
import { MatchingPolicyEntity } from '../modules/orders/infrastructure/entities/matching-policy.entity';
import { OrderNumberSequenceEntity } from '../modules/orders/infrastructure/entities/order-number-sequence.entity';
import { SellOrderCoinLotEntity } from '../modules/orders/infrastructure/entities/sell-order-coin-lot.entity';
import { SellOrderEntity } from '../modules/orders/infrastructure/entities/sell-order.entity';
import { TradeCoinLotEntity } from '../modules/trades/infrastructure/entities/trade-coin-lot.entity';
import { TradeDisputeActionEntity } from '../modules/trades/infrastructure/entities/trade-dispute-action.entity';
import { TradeDisputeEntity } from '../modules/trades/infrastructure/entities/trade-dispute.entity';
import { TradeEventEntity } from '../modules/trades/infrastructure/entities/trade-event.entity';
import { TradeEntity } from '../modules/trades/infrastructure/entities/trade.entity';
import { UserApprovalReviewEntity } from '../modules/users/infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from '../modules/users/infrastructure/entities/user-bank-account-review.entity';
import { UserBankAccountEntity } from '../modules/users/infrastructure/entities/user-bank-account.entity';
import { UserConsentEntity } from '../modules/users/infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from '../modules/users/infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from '../modules/users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../modules/users/infrastructure/entities/user.entity';

/** TypeORM에 등록하는 엔티티 목록 */
export const entities = [
  UserEntity,
  UserProfileEntity,
  UserRoleEntity,
  UserBankAccountEntity,
  UserConsentEntity,
  UserApprovalReviewEntity,
  UserBankAccountReviewEntity,
  UserCoinWalletEntity,
  UserCoinLotEntity,
  CoinLedgerEntryEntity,
  CoinPurchaseEntity,
  AdminCoinAdjustmentRequestEntity,
  AuditLogEntity,
  AdminProfileEntity,
  UserSessionEntity,
  BankEntity,
  NotificationEventEntity,
  NotificationRecipientEntity,
  NotificationOutboxEntity,
  UserPushSubscriptionEntity,
  MatchingPolicyEntity,
  OrderNumberSequenceEntity,
  BuyOrderEntity,
  SellOrderEntity,
  SellOrderCoinLotEntity,
  TradeEntity,
  TradeCoinLotEntity,
  TradeEventEntity,
  TradeDisputeEntity,
  TradeDisputeActionEntity,
  MatchingAttemptEntity,
  TradeRequestEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.getOrThrow<string>('DATABASE_HOST'),
        port: Number(configService.getOrThrow<string>('DATABASE_PORT')),
        username: configService.getOrThrow<string>('DATABASE_USERNAME'),
        password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
        database: configService.getOrThrow<string>('DATABASE_NAME'),
        entities,
        synchronize: true,
        logging: configService.get<string>('NODE_ENV') !== 'production',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
