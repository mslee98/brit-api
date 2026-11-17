import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B4-6 — 운영 대사 메모·조치 기록.
 */
export class B46ExchangeOpsNotes1753590000000 implements MigrationInterface {
  name = 'B46ExchangeOpsNotes1753590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_exchange_ops_notes" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_exchange_id" UUID NOT NULL,
        "author_user_id" UUID NOT NULL,
        "note" VARCHAR(1000) NOT NULL,
        "action" VARCHAR(30) NOT NULL DEFAULT 'NOTE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_exchange_ops_notes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_exchange_ops_notes_exchange"
          FOREIGN KEY ("partner_exchange_id")
          REFERENCES "partner_exchanges"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_partner_exchange_ops_notes_author"
          FOREIGN KEY ("author_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_exchange_ops_notes_action"
          CHECK ("action" IN (
            'NOTE', 'SYNC', 'SETTLE', 'RETRY_WEBHOOK', 'ESCALATE'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_exchange_ops_notes_exchange_created"
        ON "partner_exchange_ops_notes" ("partner_exchange_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "partner_exchange_ops_notes"`,
    );
  }
}
