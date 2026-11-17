import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B4-4 — CHARGE 지급 Outbox / Worker 작업 큐.
 * Attempt(호출 이력)와 분리해 재시도·Lease·다음 실행을 관리한다.
 */
export class B44ExchangeJobs1753570000000 implements MigrationInterface {
  name = 'B44ExchangeJobs1753570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_exchange_jobs" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_exchange_id" UUID NOT NULL,
        "job_type" VARCHAR(20) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" INT NOT NULL DEFAULT 0,
        "next_run_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "locked_by" VARCHAR(120) NULL,
        "lease_expires_at" TIMESTAMPTZ NULL,
        "fence_token" BIGINT NOT NULL DEFAULT 0,
        "last_error_code" VARCHAR(100) NULL,
        "completed_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_exchange_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_exchange_jobs_exchange"
          FOREIGN KEY ("partner_exchange_id")
          REFERENCES "partner_exchanges"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_partner_exchange_jobs_type"
          CHECK ("job_type" IN ('CREDIT', 'STATUS_SYNC', 'SETTLE')),
        CONSTRAINT "ck_partner_exchange_jobs_status"
          CHECK ("status" IN (
            'PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_exchange_jobs_exchange"
        ON "partner_exchange_jobs" ("partner_exchange_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_exchange_jobs_claim"
        ON "partner_exchange_jobs" ("status", "next_run_at", "lease_expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_exchange_jobs"`);
  }
}
