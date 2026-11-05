import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MC-2 CHARGE/REDEEM 실행:
 * - partner_coin_wallets / partner_coin_ledger_entries
 * - coin_ledger_entry_type: PARTNER_CHARGE_DEBIT, PARTNER_REDEEM_CREDIT
 */
export class AddPartnerExchangeExecution1753400000000
  implements MigrationInterface
{
  name = 'AddPartnerExchangeExecution1753400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
      ADD VALUE IF NOT EXISTS 'PARTNER_CHARGE_DEBIT'
    `);
    await queryRunner.query(`
      ALTER TYPE "coin_ledger_entry_type"
      ADD VALUE IF NOT EXISTS 'PARTNER_REDEEM_CREDIT'
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_coin_wallets" (
        "partner_id" UUID PRIMARY KEY,
        "available_balance" BIGINT NOT NULL DEFAULT 0,
        "locked_balance" BIGINT NOT NULL DEFAULT 0,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "version" BIGINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_coin_wallets_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_coin_wallets_status"
          CHECK ("status" IN ('ACTIVE', 'SUSPENDED')),
        CONSTRAINT "ck_partner_coin_wallets_locked_non_negative"
          CHECK ("locked_balance" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_coin_ledger_entries" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "transaction_id" UUID NOT NULL,
        "sequence_no" SMALLINT NOT NULL,
        "partner_id" UUID NOT NULL,
        "entry_type" VARCHAR(40) NOT NULL,
        "available_delta" BIGINT NOT NULL,
        "locked_delta" BIGINT NOT NULL DEFAULT 0,
        "reference_type" VARCHAR(40) NOT NULL,
        "reference_id" UUID,
        "description" VARCHAR(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_coin_ledger_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_coin_ledger_entry_type"
          CHECK ("entry_type" IN (
            'CHARGE_CREDIT',
            'REDEEM_DEBIT',
            'ADMIN_ADJUSTMENT'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_coin_ledger_tx_seq"
        ON "partner_coin_ledger_entries" ("transaction_id", "sequence_no")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_coin_ledger_partner_created"
        ON "partner_coin_ledger_entries" ("partner_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_coin_ledger_reference"
        ON "partner_coin_ledger_entries" ("reference_type", "reference_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_coin_ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_coin_wallets"`);
    // enum values cannot be removed safely in Postgres
  }
}
