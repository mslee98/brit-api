import { existsSync } from 'fs';
import { resolve } from 'path';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

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

/** Nest ConfigModule과 동일: `.env.local` 우선, 이어서 `.env` */
for (const file of ['.env.local', '.env']) {
  const envPath = resolve(process.cwd(), file);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD ?? '',
  database: process.env.DATABASE_NAME,
  entities: [
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
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: true,
  logging: process.env.NODE_ENV !== 'production',
});
