import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 업체별 마이너스 한도. 기본 0 → 음수 잔액이 되는 REDEEM 거절.
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddPartnerCoinWalletCreditLimit1753490000000
  implements MigrationInterface
{
  name = 'AddPartnerCoinWalletCreditLimit1753490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_coin_wallets"
        ADD COLUMN IF NOT EXISTS "credit_limit" BIGINT NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_coin_wallets"
        DROP CONSTRAINT IF EXISTS "ck_partner_coin_wallets_credit_limit"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_coin_wallets"
        ADD CONSTRAINT "ck_partner_coin_wallets_credit_limit" CHECK ("credit_limit" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_coin_wallets"
        DROP CONSTRAINT IF EXISTS "ck_partner_coin_wallets_credit_limit"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_coin_wallets" DROP COLUMN IF EXISTS "credit_limit"
    `);
  }
}
