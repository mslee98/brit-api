import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-7 M1: dispute resolution RESUME.
 * audit_logs.action_type은 varchar라 enum 변경 불필요.
 */
export class AddDisputeResolveM11753355000000 implements MigrationInterface {
  name = 'AddDisputeResolveM11753355000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "trade_dispute_resolution"
      ADD VALUE IF NOT EXISTS 'RESUME'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL enum value removal is not supported safely.
  }
}
