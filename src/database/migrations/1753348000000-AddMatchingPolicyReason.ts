import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatchingPolicyReason1753348000000 implements MigrationInterface {
  name = 'AddMatchingPolicyReason1753348000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "matching_policies"
      ADD COLUMN IF NOT EXISTS "reason" VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "matching_policies"
      DROP COLUMN IF EXISTS "reason"
    `);
  }
}
