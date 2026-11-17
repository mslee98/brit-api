import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B4-5 — Webhook Delivery Outbox.
 * 확정 이벤트 통지. 전송 실패는 원장에 영향 없음.
 */
export class B45WebhookDeliveries1753580000000 implements MigrationInterface {
  name = 'B45WebhookDeliveries1753580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_webhook_deliveries" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_exchange_event_id" UUID NOT NULL,
        "partner_client_id" UUID NOT NULL,
        "destination_url" VARCHAR(500) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" INT NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "locked_by" VARCHAR(120) NULL,
        "lease_expires_at" TIMESTAMPTZ NULL,
        "fence_token" BIGINT NOT NULL DEFAULT 0,
        "http_status" INT NULL,
        "last_error" VARCHAR(500) NULL,
        "delivered_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_webhook_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_webhook_deliveries_event"
          FOREIGN KEY ("partner_exchange_event_id")
          REFERENCES "partner_exchange_events"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_partner_webhook_deliveries_client"
          FOREIGN KEY ("partner_client_id")
          REFERENCES "partner_clients"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_partner_webhook_deliveries_status"
          CHECK ("status" IN (
            'PENDING', 'CLAIMED', 'DELIVERED', 'FAILED', 'SKIPPED'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_webhook_deliveries_event_client"
        ON "partner_webhook_deliveries"
        ("partner_exchange_event_id", "partner_client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_webhook_deliveries_claim"
        ON "partner_webhook_deliveries"
        ("status", "next_attempt_at", "lease_expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_webhook_deliveries"`);
  }
}
