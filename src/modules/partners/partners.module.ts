import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsModule } from '../admins/admins.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { CoinsModule } from '../coins/coins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AdminPartnersController } from './admin-partners.controller';
import { EmbedLinkSessionsController } from './embed-link-sessions.controller';
import { EmbedPaymentIntentsController } from './embed-payment-intents.controller';
import { MePartnerLinkApprovalsController } from './me-partner-link-approvals.controller';
import { MePartnerLinksController } from './me-partner-links.controller';
import { PartnerClientAuthGuard } from './guards/partner-client-auth.guard';
import { PartnerMemberGuard } from './guards/partner-member.guard';
import { LinkSessionStreamService } from './link-session-stream.service';
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
import { PartnerLinkSessionEntity } from './infrastructure/entities/partner-link-session.entity';
import { PartnerMemberEntity } from './infrastructure/entities/partner-member.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerClientsService } from './partner-clients.service';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerExchangesController } from './partner-exchanges.controller';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { PartnerLinkSessionsController } from './partner-link-sessions.controller';
import { PartnerLinkSessionsService } from './partner-link-sessions.service';
import { PartnerMembersService } from './partner-members.service';
import { PartnerPaymentIntentsController } from './partner-payment-intents.controller';
import { PartnerPaymentIntentsService } from './partner-payment-intents.service';
import { PartnerPortalClientsController } from './partner-portal-clients.controller';
import { PartnerPortalController } from './partner-portal.controller';
import { PartnerPortalService } from './partner-portal.service';
import { PartnerUserLinksController } from './partner-user-links.controller';
import { PartnerWalletsService } from './partner-wallets.service';
import { PartnersService } from './partners.service';

/**
 * 제휴 업체 도메인.
 * Admin 온보딩·Client·수수료 + 포털 조회 + CHARGE/REDEEM + Intent(B3).
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
      PartnerLinkSessionEntity,
      PartnerPaymentIntentEntity,
      PartnerAssetEntity,
      PartnerExchangeEntity,
      PartnerFeePolicyEntity,
      PartnerFeeAccrualEntity,
      PartnerCoinWalletEntity,
      PartnerCoinLedgerEntryEntity,
    ]),
    AuthGuardsModule,
    CoinsModule,
    NotificationsModule,
    forwardRef(() => UsersModule),
    forwardRef(() => AdminsModule),
  ],
  controllers: [
    AdminPartnersController,
    PartnerPortalController,
    PartnerPortalClientsController,
    PartnerExchangesController,
    PartnerPaymentIntentsController,
    PartnerUserLinksController,
    PartnerLinkSessionsController,
    EmbedLinkSessionsController,
    EmbedPaymentIntentsController,
    MePartnerLinkApprovalsController,
    MePartnerLinksController,
  ],
  providers: [
    LinkSessionStreamService,
    PartnerLinkSessionsService,
    PartnerPaymentIntentsService,
    PartnersService,
    PartnerMembersService,
    PartnerClientsService,
    PartnerFeePoliciesService,
    PartnerPortalService,
    PartnerCoinService,
    PartnerWalletsService,
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
    PartnerPaymentIntentsService,
    PartnerCoinService,
  ],
})
export class PartnersModule {}
