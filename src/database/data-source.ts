import 'dotenv/config';
import { DataSource } from 'typeorm';

import { UserSessionEntity } from '../modules/auth/infrastructure/entities/user-session.entity';
import { BankEntity } from '../modules/banks/infrastructure/entities/bank.entity';
import { NotificationEventEntity } from '../modules/notifications/infrastructure/entities/notification-event.entity';
import { NotificationRecipientEntity } from '../modules/notifications/infrastructure/entities/notification-recipient.entity';
import { UserApprovalReviewEntity } from '../modules/users/infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from '../modules/users/infrastructure/entities/user-bank-account-review.entity';
import { UserBankAccountEntity } from '../modules/users/infrastructure/entities/user-bank-account.entity';
import { UserCoinWalletEntity } from '../modules/users/infrastructure/entities/user-coin-wallet.entity';
import { UserConsentEntity } from '../modules/users/infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from '../modules/users/infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from '../modules/users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../modules/users/infrastructure/entities/user.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
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
    UserSessionEntity,
    BankEntity,
    NotificationEventEntity,
    NotificationRecipientEntity,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});
