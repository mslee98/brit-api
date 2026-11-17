import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B4-1 — Intent CHARGE MS 잠금.
 * - coin_ledger_entry_type: PARTNER_CHARGE_LOCKED / RELEASED
 * - partner_exchange_coin_lots
 * - partner_payment_intents.status: PAYMENT_PROCESSING
 */
export class B41PartnerChargeLock1753540000000 implements MigrationInterface {
  name = 'B41PartnerChargeLock1753540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
        ADD VALUE IF NOT EXISTS 'PARTNER_CHARGE_LOCKED'
    `);
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
        ADD VALUE IF NOT EXISTS 'PARTNER_CHARGE_RELEASED'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_exchange_coin_lots" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_exchange_id" UUID NOT NULL,
        "coin_lot_id" UUID NOT NULL,
        "locked_amount" BIGINT NOT NULL,
        "remaining_locked_amount" BIGINT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_exchange_coin_lots" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_exchange_coin_lots_exchange"
          FOREIGN KEY ("partner_exchange_id")
          REFERENCES "partner_exchanges"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_partner_exchange_coin_lots_lot"
          FOREIGN KEY ("coin_lot_id")
          REFERENCES "user_coin_lots"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_exchange_coin_lots_exchange_lot"
        ON "partner_exchange_coin_lots" ("partner_exchange_id", "coin_lot_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_exchange_coin_lots_exchange"
        ON "partner_exchange_coin_lots" ("partner_exchange_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        DROP CONSTRAINT IF EXISTS "ck_partner_payment_intents_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ADD CONSTRAINT "ck_partner_payment_intents_status"
        CHECK ("status" IN (
          'CREATED', 'USER_AUTHORIZED', 'PAYMENT_PROCESSING',
          'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'
        ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        DROP CONSTRAINT IF EXISTS "ck_partner_payment_intents_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ADD CONSTRAINT "ck_partner_payment_intents_status"
        CHECK ("status" IN (
          'CREATED', 'USER_AUTHORIZED', 'COMPLETED',
          'FAILED', 'CANCELLED', 'EXPIRED'
        ))
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "partner_exchange_coin_lots"`,
    );
    // Postgres enum value 제거는 복잡하므로 down에서는 테이블·체크만 되돌린다.
  }
}
