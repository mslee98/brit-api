import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdentityVerificationEntity } from './infrastructure/entities/identity-verification.entity';
import { UserBankAccountEntity } from './infrastructure/entities/user-bank-account.entity';
import { UserConsentEntity } from './infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from './infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from './infrastructure/entities/user-role.entity';
import { UserEntity } from './infrastructure/entities/user.entity';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserProfileEntity,
      UserRoleEntity,
      UserBankAccountEntity,
      UserConsentEntity,
      IdentityVerificationEntity,
    ]),
  ],
  providers: [UserService],
  exports: [TypeOrmModule, UserService],
})
export class UsersModule {}
