import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partner portal foundation:
 * - user_partner_links (최종 사용자 연결, CHARGE 전제)
 * - partner_assets / partner_exchanges
 * - partner_fee_policies / partner_fee_accruals
 */
export class AddPartnerPortalFeesExchanges1753390000000
  implements MigrationInterface
{
  name = 'AddPartnerPortalFeesExchanges1753390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_partner_links" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "partner_id" UUID NOT NULL,
        "partner_user_key" VARCHAR(255) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "linked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "unlinked_at" TIMESTAMPTZ,
        "exception_approved_by_user_id" UUID,
        "exception_reason" VARCHAR(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_partner_links_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_partner_links_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_partner_links_exception_approved_by"
          FOREIGN KEY ("exception_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_user_partner_links_status"
          CHECK ("status" IN ('ACTIVE', 'UNLINKED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_partner_links_partner_user_key"
        ON "user_partner_links" ("partner_id", "partner_user_key")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_partner_links_active_user_partner"
        ON "user_partner_links" ("user_id", "partner_id")
        WHERE "status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_assets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_id" UUID NOT NULL,
        "asset_code" VARCHAR(30) NOT NULL,
        "asset_name" VARCHAR(100) NOT NULL,
        "asset_type" VARCHAR(30) NOT NULL DEFAULT 'POINT',
        "exchange_rate_numerator" BIGINT NOT NULL DEFAULT 1,
        "exchange_rate_denominator" BIGINT NOT NULL DEFAULT 1,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_assets_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_assets_rate_positive"
          CHECK ("exchange_rate_numerator" > 0 AND "exchange_rate_denominator" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_assets_partner_code"
        ON "partner_assets" ("partner_id", "asset_code")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_exchanges" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "exchange_number" VARCHAR(40) NOT NULL,
        "idempotency_key" VARCHAR(100) NOT NULL,
        "user_partner_link_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "partner_id" UUID NOT NULL,
        "partner_asset_id" UUID NOT NULL,
        "partner_client_id" UUID,
        "exchange_type" VARCHAR(20) NOT NULL,
        "amount" BIGINT NOT NULL,
        "status" VARCHAR(40) NOT NULL DEFAULT 'REQUESTED',
        "partner_transaction_id" VARCHAR(100),
        "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "asset_locked_at" TIMESTAMPTZ,
        "partner_processing_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "failed_at" TIMESTAMPTZ,
        "failure_code" VARCHAR(100),
        "failure_message" VARCHAR(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_exchanges_link_id"
          FOREIGN KEY ("user_partner_link_id") REFERENCES "user_partner_links"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_exchanges_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_exchanges_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_exchanges_asset_id"
          FOREIGN KEY ("partner_asset_id") REFERENCES "partner_assets"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_exchanges_client_id"
          FOREIGN KEY ("partner_client_id") REFERENCES "partner_clients"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_partner_exchanges_type"
          CHECK ("exchange_type" IN ('CHARGE', 'REDEEM')),
        CONSTRAINT "ck_partner_exchanges_status"
          CHECK ("status" IN (
            'REQUESTED',
            'ASSET_LOCKED',
            'PARTNER_PROCESSING',
            'COMPLETED',
            'FAILED_CONFIRMED',
            'RECONCILIATION_REQUIRED'
          )),
        CONSTRAINT "ck_partner_exchanges_amount_positive"
          CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_exchanges_exchange_number"
        ON "partner_exchanges" ("exchange_number")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_exchanges_idempotency_key"
        ON "partner_exchanges" ("idempotency_key")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_exchanges_partner_status_requested"
        ON "partner_exchanges" ("partner_id", "status", "requested_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_exchanges_partner_type_completed"
        ON "partner_exchanges" ("partner_id", "exchange_type", "completed_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_fee_policies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_id" UUID NOT NULL,
        "fee_target" VARCHAR(20) NOT NULL,
        "fee_rate_bps" INTEGER NOT NULL DEFAULT 0,
        "fixed_fee_amount" BIGINT NOT NULL DEFAULT 0,
        "rounding_rule" VARCHAR(20) NOT NULL DEFAULT 'FLOOR',
        "settlement_cycle" VARCHAR(20) NOT NULL DEFAULT 'WEEKLY',
        "settlement_weekday" SMALLINT,
        "payment_due_days" SMALLINT NOT NULL DEFAULT 3,
        "effective_from" TIMESTAMPTZ NOT NULL,
        "effective_to" TIMESTAMPTZ,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_by_user_id" UUID NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_fee_policies_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_fee_policies_created_by"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_fee_policies_target"
          CHECK ("fee_target" IN ('CHARGE', 'REDEEM', 'ALL')),
        CONSTRAINT "ck_partner_fee_policies_rounding"
          CHECK ("rounding_rule" IN ('FLOOR', 'ROUND', 'CEIL')),
        CONSTRAINT "ck_partner_fee_policies_cycle"
          CHECK ("settlement_cycle" IN ('WEEKLY', 'MONTHLY')),
        CONSTRAINT "ck_partner_fee_policies_rate"
          CHECK ("fee_rate_bps" >= 0 AND "fee_rate_bps" <= 10000),
        CONSTRAINT "ck_partner_fee_policies_fixed"
          CHECK ("fixed_fee_amount" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_fee_policies_partner_active"
        ON "partner_fee_policies" ("partner_id", "is_active", "effective_from")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_fee_accruals" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_id" UUID NOT NULL,
        "partner_exchange_id" UUID NOT NULL,
        "fee_policy_id" UUID NOT NULL,
        "exchange_type" VARCHAR(20) NOT NULL,
        "gross_amount" BIGINT NOT NULL,
        "fee_rate_bps" INTEGER NOT NULL,
        "fixed_fee_amount" BIGINT NOT NULL,
        "percentage_fee_amount" BIGINT NOT NULL,
        "total_fee_amount" BIGINT NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACCRUED',
        "accrued_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "settled_at" TIMESTAMPTZ,
        CONSTRAINT "FK_partner_fee_accruals_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_fee_accruals_exchange_id"
          FOREIGN KEY ("partner_exchange_id") REFERENCES "partner_exchanges"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_fee_accruals_policy_id"
          FOREIGN KEY ("fee_policy_id") REFERENCES "partner_fee_policies"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_fee_accruals_type"
          CHECK ("exchange_type" IN ('CHARGE', 'REDEEM')),
        CONSTRAINT "ck_partner_fee_accruals_status"
          CHECK ("status" IN ('ACCRUED', 'SETTLED', 'VOID'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_fee_accruals_exchange"
        ON "partner_fee_accruals" ("partner_exchange_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_fee_accruals_partner_accrued"
        ON "partner_fee_accruals" ("partner_id", "accrued_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_fee_accruals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_fee_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_exchanges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_assets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_partner_links"`);
  }
}
