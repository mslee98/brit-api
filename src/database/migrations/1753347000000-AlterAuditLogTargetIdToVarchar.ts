import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BANK 감사 대상은 smallint PK라 UUID target_id에 넣을 수 없음.
 * 기존 UUID 값은 text 캐스팅으로 유지한다.
 */
export class AlterAuditLogTargetIdToVarchar1753347000000
  implements MigrationInterface
{
  name = 'AlterAuditLogTargetIdToVarchar1753347000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ALTER COLUMN "target_id" TYPE varchar(64)
      USING "target_id"::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ALTER COLUMN "target_id" TYPE uuid
      USING NULLIF("target_id", '')::uuid
    `);
  }
}
