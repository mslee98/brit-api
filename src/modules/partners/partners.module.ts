import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { PartnerExchangeAttemptEntity } from './infrastructure/entities/partner-exchange-attempt.entity';
import { PartnerExchangeCoinLotEntity } from './infrastructure/entities/partner-exchange-coin-lot.entity';
import { PartnerExchangeEntity } from './infrastructure/entities/partner-exchange.entity';
import { PartnerExchangeEventEntity } from './infrastructure/entities/partner-exchange-event.entity';
import { PartnerExchangeJobEntity } from './infrastructure/entities/partner-exchange-job.entity';
import { PartnerExchangeOpsNoteEntity } from './infrastructure/entities/partner-exchange-ops-note.entity';
import { PartnerWebhookDeliveryEntity } from './infrastructure/entities/partner-webhook-delivery.entity';
import { PartnerFeeAccrualEntity } from './infrastructure/entities/partner-fee-accrual.entity';
import { PartnerFeePolicyEntity } from './infrastructure/entities/partner-fee-policy.entity';
import { PartnerLinkSessionEntity } from './infrastructure/entities/partner-link-session.entity';
import { PartnerMemberEntity } from './infrastructure/entities/partner-member.entity';
import { PartnerPaymentIntentEntity } from './infrastructure/entities/partner-payment-intent.entity';
import { PartnerEntity } from './infrastructure/entities/partner.entity';
import { UserPartnerLinkEntity } from './infrastructure/entities/user-partner-link.entity';
import { PartnerChargeSettlementService } from './partner-charge-settlement.service';
import { PartnerClientsService } from './partner-clients.service';
import { PartnerCoinService } from './partner-coin.service';
import { PartnerExchangeJobsService } from './partner-exchange-jobs.service';
import { PartnerExchangeJobsWorker } from './partner-exchange-jobs.worker';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerReconciliationService } from './partner-reconciliation.service';
import { PartnerWebhookDeliveriesService } from './partner-webhook-deliveries.service';
import { PartnerWebhookDeliveryWorker } from './partner-webhook-delivery.worker';
import { PartnerExchangesController } from './partner-exchanges.controller';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { PartnerLinkSessionsController } from './partner-link-sessions.controller';
import { PartnerLinkSessionsService } from './partner-link-sessions.service';
import { PartnerMembersService } from './partner-members.service';
import { PartnerOperationsClient } from './partner-operations.client';
import { PartnerOperationsService } from './partner-operations.service';
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
 * Admin 온보딩·Client·수수료 + 포털 조회 + CHARGE/REDEEM + Intent(B4).
 */
@Module({
  imports: [
    ConfigModule,
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
      PartnerExchangeCoinLotEntity,
      PartnerExchangeAttemptEntity,
      PartnerExchangeEventEntity,
      PartnerExchangeJobEntity,
      PartnerWebhookDeliveryEntity,
      PartnerExchangeOpsNoteEntity,
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
    PartnerExchangeJobsService,
    PartnerExchangeJobsWorker,
    PartnerWebhookDeliveriesService,
    PartnerWebhookDeliveryWorker,
    PartnerOperationsClient,
    PartnerChargeSettlementService,
    PartnerOperationsService,
    PartnerReconciliationService,
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
    PartnerExchangeJobsService,
    PartnerWebhookDeliveriesService,
    PartnerOperationsService,
    PartnerChargeSettlementService,
    PartnerReconciliationService,
    PartnerPaymentIntentsService,
    PartnerCoinService,
  ],
})
export class PartnersModule {}
