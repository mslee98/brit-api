import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserSessionEntity } from '../modules/auth/infrastructure/entities/user-session.entity';
import { BankEntity } from '../modules/banks/infrastructure/entities/bank.entity';
import { UserApprovalReviewEntity } from '../modules/users/infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from '../modules/users/infrastructure/entities/user-bank-account-review.entity';
import { UserBankAccountEntity } from '../modules/users/infrastructure/entities/user-bank-account.entity';
import { UserCoinWalletEntity } from '../modules/users/infrastructure/entities/user-coin-wallet.entity';
import { UserConsentEntity } from '../modules/users/infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from '../modules/users/infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from '../modules/users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../modules/users/infrastructure/entities/user.entity';

/** TypeORM에 등록하는 ERD v3 엔티티 목록 (users ~ coin_wallets + banks + sessions) */
export const entities = [
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
        synchronize: false,
        logging: configService.get<string>('NODE_ENV') !== 'production',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
