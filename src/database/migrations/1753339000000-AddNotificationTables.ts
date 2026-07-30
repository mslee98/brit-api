import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 알림 사건/수신 테이블 추가.
 *
 * - notification_events: 업무 사건 1건
 * - notification_recipients: 수신자별 읽음·보관
 *
 * 초기 event_type / reference_type은 가입 승인 범위만 포함한다.
 * 신청자 APPROVED/REJECTED 행은 저장 가능하나, PENDING/REJECTED는 로그인
 * 불가이므로 인앱 조회는 후속 채널(SMS 등) 도입 전까지 부가 용도이다.
 */
export class AddNotificationTables1753339000000 implements MigrationInterface {
  name = 'AddNotificationTables1753339000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_event_type" AS ENUM (
        'USER_REGISTRATION_REQUESTED',
        'USER_REGISTRATION_APPROVED',
        'USER_REGISTRATION_REJECTED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notification_priority" AS ENUM (
        'LOW',
        'NORMAL',
        'HIGH',
        'URGENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notification_reference_type" AS ENUM (
        'USER',
        'USER_APPROVAL_REVIEW'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_type" "notification_event_type" NOT NULL,
        "priority" "notification_priority" NOT NULL DEFAULT 'NORMAL',
        "title" VARCHAR(200) NOT NULL,
        "message" VARCHAR(1000) NOT NULL,
        "actor_user_id" UUID,
        "reference_type" "notification_reference_type" NOT NULL,
        "reference_id" UUID NOT NULL,
        "action_path" VARCHAR(500),
        "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_events_actor_user_id"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ux_notification_events_type_reference"
          UNIQUE ("event_type", "reference_type", "reference_id"),
        CONSTRAINT "ck_notification_events_title_not_blank"
          CHECK (length(trim("title")) > 0),
        CONSTRAINT "ck_notification_events_message_not_blank"
          CHECK (length(trim("message")) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_notification_events_type_occurred"
        ON "notification_events" ("event_type", "occurred_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_notification_events_reference"
        ON "notification_events" ("reference_type", "reference_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_recipients" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "notification_event_id" UUID NOT NULL,
        "recipient_user_id" UUID NOT NULL,
        "is_read" BOOLEAN NOT NULL DEFAULT false,
        "read_at" TIMESTAMPTZ,
        "is_archived" BOOLEAN NOT NULL DEFAULT false,
        "archived_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_recipients_event"
          FOREIGN KEY ("notification_event_id")
          REFERENCES "notification_events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notification_recipients_recipient"
          FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ux_notification_recipients_event_recipient"
          UNIQUE ("notification_event_id", "recipient_user_id"),
        CONSTRAINT "ck_notification_recipients_read"
          CHECK (
            ("is_read" = false AND "read_at" IS NULL)
            OR
            ("is_read" = true AND "read_at" IS NOT NULL)
          ),
        CONSTRAINT "ck_notification_recipients_archived"
          CHECK (
            ("is_archived" = false AND "archived_at" IS NULL)
            OR
            ("is_archived" = true AND "archived_at" IS NOT NULL)
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_notification_recipients_user_created"
        ON "notification_recipients" ("recipient_user_id", "created_at" DESC)
        WHERE "is_archived" = false
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_notification_recipients_user_unread"
        ON "notification_recipients" ("recipient_user_id", "created_at" DESC)
        WHERE "is_read" = false AND "is_archived" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_recipients" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_events" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "notification_reference_type" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "notification_priority" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "notification_event_type" CASCADE`,
    );
  }
}
