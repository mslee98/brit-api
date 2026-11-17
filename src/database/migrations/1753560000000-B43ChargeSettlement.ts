import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B4-3 — CHARGE 원장 확정.
 * - partner_payment_intents.fee_policy_id 스냅샷
 * - partner_exchange_events (완료 사실 영속)
 */
export class B43ChargeSettlement1753560000000 implements MigrationInterface {
  name = 'B43ChargeSettlement1753560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ADD COLUMN IF NOT EXISTS "fee_policy_id" UUID NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "partner_payment_intents"
          ADD CONSTRAINT "fk_partner_payment_intents_fee_policy"
          FOREIGN KEY ("fee_policy_id")
          REFERENCES "partner_fee_policies"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_exchange_events" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_exchange_id" UUID NOT NULL,
        "event_type" VARCHAR(40) NOT NULL,
        "payload" JSONB NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_exchange_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_exchange_events_exchange"
          FOREIGN KEY ("partner_exchange_id")
          REFERENCES "partner_exchanges"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_partner_exchange_events_type"
          CHECK ("event_type" IN (
            'MERCHANT_PAYMENT_COMPLETED',
            'MERCHANT_PAYMENT_FAILED'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_exchange_events_exchange_type"
        ON "partner_exchange_events" ("partner_exchange_id", "event_type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_exchange_events_created"
        ON "partner_exchange_events" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_exchange_events"`);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        DROP CONSTRAINT IF EXISTS "fk_partner_payment_intents_fee_policy"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        DROP COLUMN IF EXISTS "fee_policy_id"
    `);
  }
}
