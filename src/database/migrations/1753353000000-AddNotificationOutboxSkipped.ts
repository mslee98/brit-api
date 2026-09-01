import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationOutboxSkipped1753353000000
  implements MigrationInterface
{
  name = 'AddNotificationOutboxSkipped1753353000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "notification_outbox_status" ADD VALUE IF NOT EXISTS 'SKIPPED'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL enum value 제거는 지원하지 않음
  }
}
