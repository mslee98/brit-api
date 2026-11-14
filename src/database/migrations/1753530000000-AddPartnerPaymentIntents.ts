import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B3 — CHARGE Payment Intent (Embed PIN 승인).
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddPartnerPaymentIntents1753530000000
  implements MigrationInterface
{
  name = 'AddPartnerPaymentIntents1753530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_payment_intents" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_id" UUID NOT NULL,
        "partner_client_id" UUID NOT NULL,
        "external_order_id" VARCHAR(100) NOT NULL,
        "partner_user_key" VARCHAR(255) NOT NULL,
        "amount" BIGINT NOT NULL,
        "fee_amount" BIGINT NOT NULL DEFAULT 0,
        "total_debit" BIGINT NOT NULL DEFAULT 0,
        "asset_code" VARCHAR(30),
        "return_origin" VARCHAR(255) NOT NULL,
        "status" VARCHAR(30) NOT NULL DEFAULT 'CREATED',
        "expires_at" TIMESTAMPTZ NOT NULL,
        "authorized_user_id" UUID,
        "partner_exchange_id" UUID,
        "authorized_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "failed_at" TIMESTAMPTZ,
        "failure_code" VARCHAR(80),
        "failure_message" TEXT,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_payment_intents" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_payment_intents_partner"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_partner_payment_intents_client"
          FOREIGN KEY ("partner_client_id") REFERENCES "partner_clients"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_partner_payment_intents_user"
          FOREIGN KEY ("authorized_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_partner_payment_intents_exchange"
          FOREIGN KEY ("partner_exchange_id") REFERENCES "partner_exchanges"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_partner_payment_intents_status"
          CHECK ("status" IN (
            'CREATED', 'USER_AUTHORIZED', 'COMPLETED',
            'FAILED', 'CANCELLED', 'EXPIRED'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_payment_intents_external_order"
        ON "partner_payment_intents" ("partner_id", "external_order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_payment_intents_partner_created"
        ON "partner_payment_intents" ("partner_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_payment_intents_status_expires"
        ON "partner_payment_intents" ("status", "expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_payment_intents"`);
  }
}
