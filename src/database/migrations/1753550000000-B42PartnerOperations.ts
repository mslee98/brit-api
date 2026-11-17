import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B4-2 — Partner Operations Integration.
 * - partner_clients: processing_model, operations_base_url
 * - partner_client_secrets: OPERATIONS_SIGNING_SECRET + secret_encrypted
 * - partner_exchanges: external_result_status / at
 * - partner_exchange_attempts
 */
export class B42PartnerOperations1753550000000 implements MigrationInterface {
  name = 'B42PartnerOperations1753550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        ADD COLUMN IF NOT EXISTS "processing_model" VARCHAR(30)
          NOT NULL DEFAULT 'LEGACY_CONFIRM'
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        ADD COLUMN IF NOT EXISTS "operations_base_url" VARCHAR(500) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        DROP CONSTRAINT IF EXISTS "ck_partner_clients_processing_model"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        ADD CONSTRAINT "ck_partner_clients_processing_model"
        CHECK ("processing_model" IN ('LEGACY_CONFIRM', 'BRIT_OPERATIONS'))
    `);

    await queryRunner.query(`
      ALTER TABLE "partner_client_secrets"
        ADD COLUMN IF NOT EXISTS "secret_encrypted" BYTEA NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        ADD COLUMN IF NOT EXISTS "external_result_status" VARCHAR(30)
          NOT NULL DEFAULT 'NOT_REQUESTED'
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        ADD COLUMN IF NOT EXISTS "external_result_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        DROP CONSTRAINT IF EXISTS "ck_partner_exchanges_external_result_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        ADD CONSTRAINT "ck_partner_exchanges_external_result_status"
        CHECK ("external_result_status" IN (
          'NOT_REQUESTED', 'PROCESSING', 'SUCCEEDED',
          'FAILED', 'UNKNOWN', 'NOT_FOUND'
        ))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_exchange_attempts" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_exchange_id" UUID NOT NULL,
        "attempt_no" INT NOT NULL,
        "attempt_type" VARCHAR(20) NOT NULL,
        "request_id" UUID NOT NULL,
        "request_hash" VARCHAR(64) NULL,
        "result" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
        "partner_status" VARCHAR(30) NULL,
        "partner_transaction_id" VARCHAR(100) NULL,
        "http_status" INT NULL,
        "error_code" VARCHAR(100) NULL,
        "error_message" VARCHAR(500) NULL,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_exchange_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_exchange_attempts_exchange"
          FOREIGN KEY ("partner_exchange_id")
          REFERENCES "partner_exchanges"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_partner_exchange_attempts_type"
          CHECK ("attempt_type" IN ('CREDIT', 'DEBIT', 'STATUS')),
        CONSTRAINT "ck_partner_exchange_attempts_result"
          CHECK ("result" IN (
            'REQUESTED', 'SUCCEEDED', 'FAILED',
            'PROCESSING', 'UNKNOWN', 'TRANSPORT_ERROR'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_exchange_attempts_exchange_no"
        ON "partner_exchange_attempts" ("partner_exchange_id", "attempt_no")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_exchange_attempts_request_id"
        ON "partner_exchange_attempts" ("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_exchange_attempts_exchange_started"
        ON "partner_exchange_attempts" ("partner_exchange_id", "started_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "partner_exchange_attempts"`,
    );
    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        DROP CONSTRAINT IF EXISTS "ck_partner_exchanges_external_result_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        DROP COLUMN IF EXISTS "external_result_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_exchanges"
        DROP COLUMN IF EXISTS "external_result_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_client_secrets"
        DROP COLUMN IF EXISTS "secret_encrypted"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        DROP CONSTRAINT IF EXISTS "ck_partner_clients_processing_model"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        DROP COLUMN IF EXISTS "operations_base_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_clients"
        DROP COLUMN IF EXISTS "processing_model"
    `);
  }
}
