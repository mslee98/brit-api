import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-5 Matching: trades, matching_attempts, trade_coin_lots, trade_events.
 */
export class AddP2pMatching1753343000000 implements MigrationInterface {
  name = 'AddP2pMatching1753343000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "trade_status" AS ENUM (
        'WAITING_BUYER_PAYMENT',
        'PAYMENT_TIMEOUT',
        'WAITING_SELLER_CONFIRMATION',
        'COIN_TRANSFERRING',
        'DISPUTED',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "trade_event_actor_type" AS ENUM (
        'SYSTEM',
        'BUYER',
        'SELLER',
        'ADMIN'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "matching_attempt_result" AS ENUM (
        'MATCHED',
        'NO_MATCH',
        'SUGGESTED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trades" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "trade_number" VARCHAR(40) NOT NULL,
        "buy_order_id" UUID NOT NULL,
        "sell_order_id" UUID NOT NULL,
        "buyer_user_id" UUID NOT NULL,
        "seller_user_id" UUID NOT NULL,
        "seller_bank_account_id" UUID NOT NULL,
        "seller_bank_code" VARCHAR(20) NOT NULL,
        "seller_account_number" VARCHAR(100) NOT NULL,
        "seller_account_holder_name" VARCHAR(50) NOT NULL,
        "coin_amount" BIGINT NOT NULL,
        "payment_amount" BIGINT NOT NULL,
        "status" "trade_status" NOT NULL,
        "buyer_payment_timeout_seconds" INTEGER NOT NULL,
        "buyer_payment_due_at" TIMESTAMPTZ NOT NULL,
        "seller_confirmation_timeout_seconds" INTEGER NOT NULL,
        "seller_confirmation_due_at" TIMESTAMPTZ,
        "buyer_reported_paid_at" TIMESTAMPTZ,
        "seller_confirmed_at" TIMESTAMPTZ,
        "coin_transfer_started_at" TIMESTAMPTZ,
        "coin_transferred_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "cancellation_reason" VARCHAR(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_trades_buy_order"
          FOREIGN KEY ("buy_order_id") REFERENCES "buy_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trades_sell_order"
          FOREIGN KEY ("sell_order_id") REFERENCES "sell_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trades_buyer"
          FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trades_seller"
          FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trades_seller_bank"
          FOREIGN KEY ("seller_bank_account_id") REFERENCES "user_bank_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_trades_coin_amount" CHECK ("coin_amount" > 0),
        CONSTRAINT "ck_trades_payment_amount" CHECK ("payment_amount" > 0),
        CONSTRAINT "ck_trades_amounts_equal" CHECK ("coin_amount" = "payment_amount")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_trades_trade_number" ON "trades" ("trade_number")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_trades_buy_order_id" ON "trades" ("buy_order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_trades_sell_order_id" ON "trades" ("sell_order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_trades_buyer_created" ON "trades" ("buyer_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_trades_seller_created" ON "trades" ("seller_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_trades_status_due" ON "trades" ("status", "buyer_payment_due_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "trade_coin_lots" (
        "trade_id" UUID NOT NULL,
        "coin_lot_id" UUID NOT NULL,
        "allocated_amount" BIGINT NOT NULL,
        "transferred_amount" BIGINT NOT NULL DEFAULT 0,
        "returned_amount" BIGINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("trade_id", "coin_lot_id"),
        CONSTRAINT "fk_trade_coin_lots_trade"
          FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_coin_lots_lot"
          FOREIGN KEY ("coin_lot_id") REFERENCES "user_coin_lots"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_trade_coin_lots_amounts" CHECK (
          "allocated_amount" >= 0
          AND "transferred_amount" >= 0
          AND "returned_amount" >= 0
        ),
        CONSTRAINT "ck_trade_coin_lots_alloc" CHECK (
          "transferred_amount" + "returned_amount" <= "allocated_amount"
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trade_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "trade_id" UUID NOT NULL,
        "previous_status" "trade_status",
        "new_status" "trade_status",
        "event_code" VARCHAR(50) NOT NULL,
        "actor_type" "trade_event_actor_type" NOT NULL,
        "actor_user_id" UUID,
        "message" VARCHAR(1000),
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_trade_events_trade"
          FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_events_actor"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_trade_events_trade_created"
        ON "trade_events" ("trade_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "matching_attempts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "buy_order_id" UUID NOT NULL,
        "sell_order_id" UUID,
        "result" "matching_attempt_result" NOT NULL,
        "trade_id" UUID,
        "reason_code" VARCHAR(50),
        "attempted_at" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "fk_matching_attempts_buy"
          FOREIGN KEY ("buy_order_id") REFERENCES "buy_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_attempts_sell"
          FOREIGN KEY ("sell_order_id") REFERENCES "sell_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_attempts_trade"
          FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_matching_attempts_buy_attempted"
        ON "matching_attempts" ("buy_order_id", "attempted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_matching_attempts_trade_id"
        ON "matching_attempts" ("trade_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_sell_orders_match_candidates"
        ON "sell_orders" ("remaining_coin_amount", "created_at")
        WHERE "status" IN ('OPEN', 'PARTIALLY_MATCHED')
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_buy_orders_rematch"
        ON "buy_orders" ("next_matchable_at")
        WHERE "status" = 'MATCHING' AND "next_matchable_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_buy_orders_rematch"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_sell_orders_match_candidates"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "matching_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trade_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trade_coin_lots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trades"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "matching_attempt_result"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_event_actor_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_status"`);
  }
}
