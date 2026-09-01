import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-5b M1: trade_requests + Buy REQUEST_PENDING + Accept link + Request TTL policy.
 * 로컬 synchronize와 병행될 수 있어 대부분 IF NOT EXISTS / 존재 가드로 멱등.
 */
export class AddTradeRequests1753350000000 implements MigrationInterface {
  name = 'AddTradeRequests1753350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "buy_order_status"
      ADD VALUE IF NOT EXISTS 'REQUEST_PENDING'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "trade_request_status" AS ENUM (
          'PENDING_SELLER',
          'ACCEPTED',
          'REJECTED',
          'EXPIRED',
          'CANCELLED_BY_BUYER'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "trade_request_rejection_reason" AS ENUM (
          'NOT_AVAILABLE_NOW',
          'AMOUNT_NOT_PREFERRED',
          'OTHER'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trade_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "buy_order_id" UUID NOT NULL,
        "sell_order_id" UUID NOT NULL,
        "buyer_user_id" UUID NOT NULL,
        "seller_user_id" UUID NOT NULL,
        "requested_coin_amount" BIGINT NOT NULL,
        "match_type" "buy_match_type" NOT NULL,
        "status" "trade_request_status" NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "rejection_reason_code" "trade_request_rejection_reason",
        "accepted_at" TIMESTAMPTZ,
        "rejected_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "expired_at" TIMESTAMPTZ,
        "idempotency_key" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_trade_requests_buy_order"
          FOREIGN KEY ("buy_order_id") REFERENCES "buy_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_requests_sell_order"
          FOREIGN KEY ("sell_order_id") REFERENCES "sell_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_requests_buyer"
          FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_requests_seller"
          FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_trade_requests_requested_coin_amount"
          CHECK ("requested_coin_amount" > 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_trade_request_pending_buy"
        ON "trade_requests" ("buy_order_id")
        WHERE "status" = 'PENDING_SELLER'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_trade_request_pending_sell"
        ON "trade_requests" ("sell_order_id")
        WHERE "status" = 'PENDING_SELLER'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_trade_requests_buyer_idempotency"
        ON "trade_requests" ("buyer_user_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_trade_requests_sell_status"
        ON "trade_requests" ("sell_order_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_trade_requests_expires"
        ON "trade_requests" ("expires_at")
        WHERE "status" = 'PENDING_SELLER'
    `);

    await queryRunner.query(`
      ALTER TABLE "trades"
        ADD COLUMN IF NOT EXISTS "trade_request_id" UUID
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_trades_trade_request_id"
        ON "trades" ("trade_request_id")
        WHERE "trade_request_id" IS NOT NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
          WHERE c.conrelid = 'trades'::regclass
            AND a.attname = 'trade_request_id'
            AND c.contype = 'f'
        ) THEN
          ALTER TABLE "trades"
            ADD CONSTRAINT "fk_trades_trade_request"
              FOREIGN KEY ("trade_request_id") REFERENCES "trade_requests"("id")
              ON DELETE RESTRICT;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        ADD COLUMN IF NOT EXISTS "trade_request_timeout_seconds" INTEGER NOT NULL DEFAULT 180
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "matching_policies"
          ADD CONSTRAINT "ck_matching_policies_trade_request_timeout"
          CHECK ("trade_request_timeout_seconds" > 0);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        DROP CONSTRAINT IF EXISTS "ck_matching_policies_trade_request_timeout"
    `);
    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        DROP COLUMN IF EXISTS "trade_request_timeout_seconds"
    `);

    await queryRunner.query(`
      ALTER TABLE "trades"
        DROP CONSTRAINT IF EXISTS "fk_trades_trade_request"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "ux_trades_trade_request_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "trades"
        DROP COLUMN IF EXISTS "trade_request_id"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "ix_trade_requests_expires"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_trade_requests_sell_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ux_trade_requests_buyer_idempotency"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_trade_request_pending_sell"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_trade_request_pending_buy"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "trade_requests"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "trade_request_rejection_reason"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_request_status"`);
    // buy_order_status 'REQUEST_PENDING' 제거는 PostgreSQL에서 enum value DROP이 까다로워 생략
  }
}
