import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-3 Coin Lot / Ledger / Purchase / audit_logs.
 * user_coin_wallets는 기존 마이그레이션에 있음.
 */
export class AddCoinLotLedgerPurchaseAudit1753341000000
  implements MigrationInterface
{
  name = 'AddCoinLotLedgerPurchaseAudit1753341000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "coin_source_type" AS ENUM (
        'BRIT_PURCHASE',
        'PARTNER_REDEEM',
        'PARTNER_ADMIN_GRANT',
        'P2P_PURCHASE',
        'ADMIN_ADJUSTMENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "coin_lot_status" AS ENUM (
        'AVAILABLE',
        'PARTIALLY_USED',
        'FULLY_CONSUMED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "coin_ledger_entry_type" AS ENUM (
        'BRIT_PURCHASE_CONFIRMED',
        'ADMIN_CREDIT',
        'ADMIN_DEBIT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "coin_purchase_status" AS ENUM (
        'PENDING',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_coin_lots" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "source_type" "coin_source_type" NOT NULL,
        "source_id" UUID,
        "original_amount" BIGINT NOT NULL,
        "remaining_amount" BIGINT NOT NULL,
        "locked_amount" BIGINT NOT NULL DEFAULT 0,
        "consumed_amount" BIGINT NOT NULL DEFAULT 0,
        "is_sellable" BOOLEAN NOT NULL,
        "status" "coin_lot_status" NOT NULL,
        "available_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_coin_lots_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_user_coin_lots_amounts_non_negative"
          CHECK (
            "original_amount" >= 0
            AND "remaining_amount" >= 0
            AND "locked_amount" >= 0
            AND "consumed_amount" >= 0
          ),
        CONSTRAINT "ck_user_coin_lots_amount_sum"
          CHECK (
            "original_amount" = "remaining_amount" + "locked_amount" + "consumed_amount"
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_user_coin_lots_user_available"
        ON "user_coin_lots" ("user_id", "is_sellable", "status", "available_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "coin_ledger_entries" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "transaction_id" UUID NOT NULL,
        "sequence_no" SMALLINT NOT NULL,
        "user_id" UUID NOT NULL,
        "coin_lot_id" UUID,
        "entry_type" "coin_ledger_entry_type" NOT NULL,
        "non_sellable_delta" BIGINT NOT NULL DEFAULT 0,
        "sellable_delta" BIGINT NOT NULL DEFAULT 0,
        "locked_non_sellable_delta" BIGINT NOT NULL DEFAULT 0,
        "locked_sellable_delta" BIGINT NOT NULL DEFAULT 0,
        "reference_type" VARCHAR(50) NOT NULL,
        "reference_id" UUID,
        "description" VARCHAR(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_coin_ledger_entries_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_coin_ledger_entries_coin_lot_id"
          FOREIGN KEY ("coin_lot_id") REFERENCES "user_coin_lots"("id") ON DELETE RESTRICT,
        CONSTRAINT "ux_coin_ledger_entries_tx_seq"
          UNIQUE ("transaction_id", "sequence_no")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_coin_ledger_entries_user_created"
        ON "coin_ledger_entries" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_coin_ledger_entries_reference"
        ON "coin_ledger_entries" ("reference_type", "reference_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "coin_purchases" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "amount" BIGINT NOT NULL,
        "status" "coin_purchase_status" NOT NULL,
        "completed_at" TIMESTAMPTZ,
        "created_by_user_id" UUID,
        "completed_by_user_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_coin_purchases_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_coin_purchases_created_by"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_coin_purchases_completed_by"
          FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_coin_purchases_amount_positive"
          CHECK ("amount" > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_coin_purchases_user_status"
        ON "coin_purchases" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_user_id" UUID,
        "action_type" VARCHAR(100) NOT NULL,
        "target_type" VARCHAR(50) NOT NULL,
        "target_id" UUID,
        "before_data" JSONB,
        "after_data" JSONB,
        "reason" VARCHAR(1000),
        "ip_address" INET,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_audit_logs_actor_user_id"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_audit_logs_actor_created"
        ON "audit_logs" ("actor_user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_audit_logs_target"
        ON "audit_logs" ("target_type", "target_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_audit_logs_action_created"
        ON "audit_logs" ("action_type", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coin_purchases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coin_ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_coin_lots"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coin_purchase_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coin_ledger_entry_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coin_lot_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coin_source_type"`);
  }
}
