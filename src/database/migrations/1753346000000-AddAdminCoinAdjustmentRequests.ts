import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 관리자 Coin credit/debit Idempotency-Key 저장.
 */
export class AddAdminCoinAdjustmentRequests1753346000000
  implements MigrationInterface
{
  name = 'AddAdminCoinAdjustmentRequests1753346000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "admin_coin_adjustment_operation" AS ENUM (
        'CREDIT',
        'DEBIT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "admin_coin_adjustment_request_status" AS ENUM (
        'IN_PROGRESS',
        'SUCCEEDED',
        'FAILED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_coin_adjustment_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "idempotency_key" UUID NOT NULL,
        "actor_user_id" UUID NOT NULL,
        "target_user_id" UUID NOT NULL,
        "operation" "admin_coin_adjustment_operation" NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "status" "admin_coin_adjustment_request_status" NOT NULL,
        "response_body" JSONB,
        "ledger_transaction_id" UUID,
        "failure_code" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_admin_coin_adj_actor"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_admin_coin_adj_target"
          FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_admin_coin_adj_actor_key"
        ON "admin_coin_adjustment_requests" ("actor_user_id", "idempotency_key")
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_admin_coin_adj_status_updated"
        ON "admin_coin_adjustment_requests" ("status", "updated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_admin_coin_adj_status_updated"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ux_admin_coin_adj_actor_key"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "admin_coin_adjustment_requests"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "admin_coin_adjustment_request_status"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "admin_coin_adjustment_operation"`,
    );
  }
}
