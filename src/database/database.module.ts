import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserSessionEntity } from '../modules/auth/infrastructure/entities/user-session.entity';
import { BankEntity } from '../modules/banks/infrastructure/entities/bank.entity';
import { IdentityVerificationEntity } from '../modules/users/infrastructure/entities/identity-verification.entity';
import { UserBankAccountEntity } from '../modules/users/infrastructure/entities/user-bank-account.entity';
import { UserConsentEntity } from '../modules/users/infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from '../modules/users/infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from '../modules/users/infrastructure/entities/user-role.entity';
import { UserEntity } from '../modules/users/infrastructure/entities/user.entity';

export const entities = [
  UserEntity,
  UserProfileEntity,
  UserRoleEntity,
  UserBankAccountEntity,
  UserConsentEntity,
  IdentityVerificationEntity,
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
