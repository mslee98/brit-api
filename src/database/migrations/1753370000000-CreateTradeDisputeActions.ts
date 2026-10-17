import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-7 M3: 분쟁 삼자 채팅·내부메모.
 */
export class CreateTradeDisputeActions1753370000000 implements MigrationInterface {
  name = 'CreateTradeDisputeActions1753370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trade_dispute_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "dispute_id" uuid NOT NULL,
        "action_type" character varying(50) NOT NULL,
        "actor_user_id" uuid,
        "is_internal" boolean NOT NULL DEFAULT false,
        "message" text,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_trade_dispute_actions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_trade_dispute_actions_dispute"
          FOREIGN KEY ("dispute_id") REFERENCES "trade_disputes"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_trade_dispute_actions_actor"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_trade_dispute_actions_dispute_created"
        ON "trade_dispute_actions" ("dispute_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "ix_trade_dispute_actions_dispute_created"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "trade_dispute_actions"
    `);
  }
}
