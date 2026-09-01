import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1 알림 이벤트 확대: 거절·만료·취소·분쟁.
 */
export class AddP1NotificationEventTypes1753354000000
  implements MigrationInterface
{
  name = 'AddP1NotificationEventTypes1753354000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_REQUEST_REJECTED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_EXPIRED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'TRADE_CANCELLED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'DISPUTE_OPENED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'DISPUTE_RESOLVED'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL enum value removal is not supported safely.
  }
}
