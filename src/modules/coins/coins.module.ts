import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { UserEntity } from '../users/infrastructure/entities/user.entity';
import { AdminCoinPurchaseController } from './admin-coin-purchase.controller';
import { AdminCoinController } from './admin-coin.controller';
import { CoinController } from './coin.controller';
import { CoinService } from './coin.service';
import { AuditLogEntity } from './infrastructure/entities/audit-log.entity';
import { AdminCoinAdjustmentRequestEntity } from './infrastructure/entities/admin-coin-adjustment-request.entity';
import { CoinLedgerEntryEntity } from './infrastructure/entities/coin-ledger-entry.entity';
import { CoinPurchaseEntity } from './infrastructure/entities/coin-purchase.entity';
import { UserCoinLotEntity } from './infrastructure/entities/user-coin-lot.entity';
import { UserCoinWalletEntity } from './infrastructure/entities/user-coin-wallet.entity';

/**
 * 사용자 Coin Wallet/Lot/Ledger.
 * UsersModule이 CoinService를 주입해 가입 시 지갑을 생성한다 (단방향 의존).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserCoinWalletEntity,
      UserCoinLotEntity,
      CoinLedgerEntryEntity,
      CoinPurchaseEntity,
      AdminCoinAdjustmentRequestEntity,
      AuditLogEntity,
      UserEntity,
    ]),
    AuthGuardsModule,
    forwardRef(() => AdminsModule),
  ],
  controllers: [
    CoinController,
    AdminCoinController,
    AdminCoinPurchaseController,
  ],
  providers: [CoinService],
  exports: [CoinService],
})
export class CoinsModule {}
