import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AuthModule } from '../auth/auth.module';
import { AdminsModule } from '../admins/admins.module';
import { CoinsModule } from '../coins/coins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminUserApprovalsController } from './admin-user-approvals.controller';
import { AdminUserController } from './admin-user.controller';
import { UserApprovalReviewEntity } from './infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from './infrastructure/entities/user-bank-account-review.entity';
import { UserBankAccountEntity } from './infrastructure/entities/user-bank-account.entity';
import { UserConsentEntity } from './infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from './infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from './infrastructure/entities/user-role.entity';
import { UserEntity } from './infrastructure/entities/user.entity';
import { UserService } from './user.service';

/**
 * 사용자 도메인 모듈.
 * Coin 지갑은 CoinsModule 소유 — 가입 시 CoinService로 생성.
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
    ]),
    NotificationsModule,
    CoinsModule,
    AuthGuardsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AdminsModule),
  ],
  controllers: [AdminUserApprovalsController, AdminUserController],
  providers: [UserService],
  exports: [TypeOrmModule, UserService],
})
export class UsersModule {}
