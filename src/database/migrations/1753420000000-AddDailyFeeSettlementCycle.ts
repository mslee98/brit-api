import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 수수료 정산 주기에 DAILY 추가.
 */
export class AddDailyFeeSettlementCycle1753420000000
  implements MigrationInterface
{
  name = 'AddDailyFeeSettlementCycle1753420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_fee_policies"
        DROP CONSTRAINT IF EXISTS "ck_partner_fee_policies_cycle"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_fee_policies"
        ADD CONSTRAINT "ck_partner_fee_policies_cycle"
        CHECK ("settlement_cycle" IN ('DAILY', 'WEEKLY', 'MONTHLY'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "partner_fee_policies"
         SET "settlement_cycle" = 'WEEKLY'
       WHERE "settlement_cycle" = 'DAILY'
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_fee_policies"
        DROP CONSTRAINT IF EXISTS "ck_partner_fee_policies_cycle"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_fee_policies"
        ADD CONSTRAINT "ck_partner_fee_policies_cycle"
        CHECK ("settlement_cycle" IN ('WEEKLY', 'MONTHLY'))
    `);
  }
}
