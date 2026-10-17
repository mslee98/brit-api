import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-7 M2: 분쟁 인박스 assignee=me 조회용 인덱스.
 */
export class AddDisputeAssigneeIndex1753360000000 implements MigrationInterface {
  name = 'AddDisputeAssigneeIndex1753360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_trade_disputes_assigned_status"
        ON "trade_disputes" ("assigned_admin_user_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "ix_trade_disputes_assigned_status"
    `);
  }
}
