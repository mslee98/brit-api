import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-4 Buy/Sell Orders + matching_policies + order number sequences.
 * Also extends coin_ledger_entry_type for SELL_ORDER_LOCKED / RELEASED.
 */
export class AddP2pOrders1753342000000 implements MigrationInterface {
  name = 'AddP2pOrders1753342000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
      ADD VALUE IF NOT EXISTS 'SELL_ORDER_LOCKED'
    `);
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
      ADD VALUE IF NOT EXISTS 'SELL_ORDER_RELEASED'
    `);

    await queryRunner.query(`
      CREATE TYPE "buy_order_status" AS ENUM (
        'MATCHING',
        'MATCHED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "sell_order_status" AS ENUM (
        'OPEN',
        'PARTIALLY_MATCHED',
        'FULLY_RESERVED',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "matching_policies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "min_split_ratio_bps" INTEGER NOT NULL,
        "buyer_payment_timeout_seconds" INTEGER NOT NULL,
        "seller_confirmation_timeout_seconds" INTEGER NOT NULL,
        "max_rematch_count" INTEGER NOT NULL DEFAULT 3,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "effective_from" TIMESTAMPTZ NOT NULL,
        "created_by_user_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_matching_policies_created_by"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_number_sequences" (
        "prefix" VARCHAR(10) NOT NULL,
        "yyyymmdd" VARCHAR(8) NOT NULL,
        "last_value" INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("prefix", "yyyymmdd")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "buy_orders" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_number" VARCHAR(40) NOT NULL,
        "buyer_user_id" UUID NOT NULL,
        "coin_amount" BIGINT NOT NULL,
        "status" "buy_order_status" NOT NULL,
        "rematch_count" INTEGER NOT NULL DEFAULT 0,
        "next_matchable_at" TIMESTAMPTZ,
        "idempotency_key" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "matched_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_buy_orders_buyer"
          FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_buy_orders_coin_amount" CHECK ("coin_amount" > 0),
        CONSTRAINT "ck_buy_orders_rematch_count" CHECK ("rematch_count" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_buy_orders_order_number"
        ON "buy_orders" ("order_number")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_buy_orders_buyer_created"
        ON "buy_orders" ("buyer_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_buy_orders_buyer_idempotency"
        ON "buy_orders" ("buyer_user_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "sell_orders" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_number" VARCHAR(40) NOT NULL,
        "seller_user_id" UUID NOT NULL,
        "matching_policy_id" UUID NOT NULL,
        "original_coin_amount" BIGINT NOT NULL,
        "remaining_coin_amount" BIGINT NOT NULL,
        "reserved_coin_amount" BIGINT NOT NULL DEFAULT 0,
        "completed_coin_amount" BIGINT NOT NULL DEFAULT 0,
        "minimum_trade_amount" BIGINT NOT NULL,
        "min_split_ratio_bps_snapshot" INTEGER NOT NULL,
        "status" "sell_order_status" NOT NULL,
        "idempotency_key" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_sell_orders_seller"
          FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_sell_orders_policy"
          FOREIGN KEY ("matching_policy_id") REFERENCES "matching_policies"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "ck_sell_orders_original" CHECK ("original_coin_amount" > 0),
        CONSTRAINT "ck_sell_orders_amounts_non_negative" CHECK (
          "remaining_coin_amount" >= 0
          AND "reserved_coin_amount" >= 0
          AND "completed_coin_amount" >= 0
          AND "minimum_trade_amount" > 0
        ),
        CONSTRAINT "ck_sell_orders_amount_sum" CHECK (
          "original_coin_amount"
            = "remaining_coin_amount"
            + "reserved_coin_amount"
            + "completed_coin_amount"
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_sell_orders_order_number"
        ON "sell_orders" ("order_number")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_sell_orders_seller_created"
        ON "sell_orders" ("seller_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_sell_orders_seller_idempotency"
        ON "sell_orders" ("seller_user_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "sell_order_coin_lots" (
        "sell_order_id" UUID NOT NULL,
        "coin_lot_id" UUID NOT NULL,
        "locked_amount" BIGINT NOT NULL,
        "consumed_amount" BIGINT NOT NULL DEFAULT 0,
        "released_amount" BIGINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("sell_order_id", "coin_lot_id"),
        CONSTRAINT "fk_sell_order_coin_lots_order"
          FOREIGN KEY ("sell_order_id") REFERENCES "sell_orders"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "fk_sell_order_coin_lots_lot"
          FOREIGN KEY ("coin_lot_id") REFERENCES "user_coin_lots"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "ck_sell_order_coin_lots_amounts" CHECK (
          "locked_amount" >= 0
          AND "consumed_amount" >= 0
          AND "released_amount" >= 0
        ),
        CONSTRAINT "ck_sell_order_coin_lots_alloc" CHECK (
          "consumed_amount" + "released_amount" <= "locked_amount"
        )
      )
    `);

    await queryRunner.query(`
      INSERT INTO "matching_policies" (
        "min_split_ratio_bps",
        "buyer_payment_timeout_seconds",
        "seller_confirmation_timeout_seconds",
        "max_rematch_count",
        "is_active",
        "effective_from",
        "created_by_user_id"
      ) VALUES (
        2000,
        300,
        180,
        3,
        true,
        now(),
        NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sell_order_coin_lots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sell_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "buy_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_number_sequences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "matching_policies"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sell_order_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "buy_order_status"`);
  }
}
