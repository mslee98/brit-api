import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M7 Web Push: 기기 구독 + 거래 알림 enum + outbox.
 * synchronize와 병행될 수 있어 IF NOT EXISTS / 존재 가드로 멱등.
 */
export class AddPushSubscriptionsAndOutbox1753352000000
  implements MigrationInterface
{
  name = 'AddPushSubscriptionsAndOutbox1753352000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_REQUEST_CREATED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_REQUEST_ACCEPTED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_PAYMENT_REPORTED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_COMPLETED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_reference_type" ADD VALUE IF NOT EXISTS 'TRADE_REQUEST'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_reference_type" ADD VALUE IF NOT EXISTS 'TRADE'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_reference_type" ADD VALUE IF NOT EXISTS 'SELL_ORDER'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_push_subscriptions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "endpoint" VARCHAR(2048) NOT NULL,
        "p256dh" VARCHAR(255) NOT NULL,
        "auth" VARCHAR(255) NOT NULL,
        "user_agent" VARCHAR(512),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_push_subscriptions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ux_user_push_subscriptions_endpoint" UNIQUE ("endpoint")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_user_push_subscriptions_user_id"
        ON "user_push_subscriptions" ("user_id")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_outbox_status" AS ENUM (
          'PENDING',
          'SENT',
          'FAILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_outbox" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "notification_event_id" UUID NOT NULL,
        "recipient_user_id" UUID NOT NULL,
        "status" "notification_outbox_status" NOT NULL DEFAULT 'PENDING',
        "attempt_count" INT NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_error" VARCHAR(500),
        "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_outbox_event_id"
          FOREIGN KEY ("notification_event_id") REFERENCES "notification_events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notification_outbox_recipient_user_id"
          FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ux_notification_outbox_event_recipient"
          UNIQUE ("notification_event_id", "recipient_user_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_notification_outbox_pending"
        ON "notification_outbox" ("status", "next_attempt_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_outbox"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_outbox_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_push_subscriptions"`);
  }
}
