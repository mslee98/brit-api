import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { CoinsModule } from '../coins/coins.module';
import { UsersModule } from '../users/users.module';
import { AdminPartnersController } from './admin-partners.controller';
import { PartnerClientAuthGuard } from './guards/partner-client-auth.guard';
import { PartnerMemberGuard } from './guards/partner-member.guard';
import { PartnerAssetEntity } from './infrastructure/entities/partner-asset.entity';
import { PartnerClientOriginEntity } from './infrastructure/entities/partner-client-origin.entity';
import { PartnerClientScopeEntity } from './infrastructure/entities/partner-client-scope.entity';
import { PartnerClientSecretEntity } from './infrastructure/entities/partner-client-secret.entity';
import { PartnerClientEntity } from './infrastructure/entities/partner-client.entity';
import { PartnerCoinLedgerEntryEntity } from './infrastructure/entities/partner-coin-ledger-entry.entity';
import { PartnerCoinWalletEntity } from './infrastructure/entities/partner-coin-wallet.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerMemberEntity } from './infrastructure/entities/partner-member.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerClientsService } from './partner-clients.service';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerExchangesController } from './partner-exchanges.controller';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { PartnerMembersService } from './partner-members.service';
import { PartnerPortalController } from './partner-portal.controller';
import { PartnerPortalService } from './partner-portal.service';
import { PartnersService } from './partners.service';

/**
 * 제휴 업체 도메인.
 * Admin 온보딩·Client·수수료 + 포털 조회 + CHARGE/REDEEM 실행.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnerEntity,
      PartnerMemberEntity,
      PartnerClientEntity,
      PartnerClientSecretEntity,
      PartnerClientScopeEntity,
      PartnerClientOriginEntity,
      UserPartnerLinkEntity,
      PartnerAssetEntity,
      PartnerExchangeEntity,
      PartnerFeePolicyEntity,
      PartnerFeeAccrualEntity,
      PartnerCoinWalletEntity,
      PartnerCoinLedgerEntryEntity,
    ]),
    AuthGuardsModule,
    CoinsModule,
    forwardRef(() => UsersModule),
    forwardRef(() => AdminsModule),
  ],
  controllers: [
    AdminPartnersController,
    PartnerPortalController,
    PartnerExchangesController,
  ],
  providers: [
    PartnersService,
    PartnerMembersService,
    PartnerClientsService,
    PartnerFeePoliciesService,
    PartnerPortalService,
    PartnerCoinService,
    PartnerExchangeService,
    PartnerMemberGuard,
    PartnerClientAuthGuard,
  ],
  exports: [
    TypeOrmModule,
    PartnersService,
    PartnerMembersService,
    PartnerClientsService,
    PartnerFeePoliciesService,
    PartnerPortalService,
    PartnerExchangeService,
    PartnerCoinService,
  ],
})
export class PartnersModule {}
