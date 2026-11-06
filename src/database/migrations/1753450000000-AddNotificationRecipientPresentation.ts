import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notification_recipients 수신자별 표현 컬럼.
 * 한 알림 사건을 구매·판매 양쪽이 받을 때 역할별 문구·이동 경로·거래 스냅샷을 담는다.
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddNotificationRecipientPresentation1753450000000 implements MigrationInterface {
  name = 'AddNotificationRecipientPresentation1753450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_recipients"
        ADD COLUMN IF NOT EXISTS "recipient_role" varchar(16),
        ADD COLUMN IF NOT EXISTS "title" varchar(200),
        ADD COLUMN IF NOT EXISTS "message" varchar(1000),
        ADD COLUMN IF NOT EXISTS "action_path" varchar(500),
        ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_recipients"
        DROP COLUMN IF EXISTS "payload",
        DROP COLUMN IF EXISTS "action_path",
        DROP COLUMN IF EXISTS "message",
        DROP COLUMN IF EXISTS "title",
        DROP COLUMN IF EXISTS "recipient_role"
    `);
  }
}
