import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-6 Trade 진행: P2P ledger, trade timeout index, trade_disputes.
 */
export class AddTradeProgression1753344000000 implements MigrationInterface {
  name = 'AddTradeProgression1753344000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
      ADD VALUE IF NOT EXISTS 'P2P_TRANSFER_OUT'
    `);
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
      ADD VALUE IF NOT EXISTS 'P2P_TRANSFER_IN'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_coin_ledger_entries_trade_entry"
        ON "coin_ledger_entries" ("reference_type", "reference_id", "entry_type")
        WHERE "reference_type" = 'TRADE'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_trades_status_seller_due"
        ON "trades" ("status", "seller_confirmation_due_at")
    `);

    await queryRunner.query(`
      CREATE TYPE "trade_dispute_status" AS ENUM (
        'OPEN_UNASSIGNED',
        'ASSIGNED',
        'IN_REVIEW',
        'EVIDENCE_REQUIRED',
        'RESOLVED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "trade_dispute_priority" AS ENUM (
        'LOW',
        'NORMAL',
        'HIGH'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "trade_dispute_resolution" AS ENUM (
        'FORCE_COMPLETE',
        'FORCE_CANCEL'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trade_disputes" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "dispute_number" VARCHAR(40) NOT NULL,
        "trade_id" UUID NOT NULL,
        "reason_code" VARCHAR(50) NOT NULL,
        "status" "trade_dispute_status" NOT NULL,
        "priority" "trade_dispute_priority" NOT NULL DEFAULT 'NORMAL',
        "requested_by_user_id" UUID,
        "assigned_admin_user_id" UUID,
        "leader_admin_user_id" UUID,
        "resolution" "trade_dispute_resolution",
        "resolution_reason" VARCHAR(1000),
        "requested_at" TIMESTAMPTZ NOT NULL,
        "assigned_at" TIMESTAMPTZ,
        "resolved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_trade_disputes_trade"
          FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_disputes_requested_by"
          FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_trade_disputes_assigned_admin"
          FOREIGN KEY ("assigned_admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_trade_disputes_leader_admin"
          FOREIGN KEY ("leader_admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_trade_disputes_dispute_number"
        ON "trade_disputes" ("dispute_number")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_trade_disputes_trade_id"
        ON "trade_disputes" ("trade_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "trade_disputes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_dispute_resolution"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_dispute_priority"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_dispute_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_trades_status_seller_due"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ux_coin_ledger_entries_trade_entry"`,
    );
  }
}
