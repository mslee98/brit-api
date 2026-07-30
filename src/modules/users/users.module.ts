import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserApprovalReviewEntity } from './infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from './infrastructure/entities/user-bank-account-review.entity';
import { UserBankAccountEntity } from './infrastructure/entities/user-bank-account.entity';
import { UserCoinWalletEntity } from './infrastructure/entities/user-coin-wallet.entity';
import { UserConsentEntity } from './infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from './infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from './infrastructure/entities/user-role.entity';
import { UserEntity } from './infrastructure/entities/user.entity';
import { UserService } from './user.service';

/**
 * 사용자 도메인 모듈 (ERD: users ~ user_coin_wallets).
 * AuthModule이 UserService를 import해 가입·역할 조회에 사용한다.
 * user_sessions는 AuthModule이 소유.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserProfileEntity,
      UserRoleEntity,
      UserBankAccountEntity,
      UserConsentEntity,
      UserApprovalReviewEntity,
      UserBankAccountReviewEntity,
      UserCoinWalletEntity,
    ]),
  ],
  providers: [UserService],
  exports: [TypeOrmModule, UserService],
})
export class UsersModule {}
