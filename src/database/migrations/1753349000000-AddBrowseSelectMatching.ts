import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Browse+Select: buy matched amount/type + near match ratio policy.
 */
export class AddBrowseSelectMatching1753349000000
  implements MigrationInterface
{
  name = 'AddBrowseSelectMatching1753349000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "buy_match_type" AS ENUM ('EXACT', 'NEAR')
    `);

    await queryRunner.query(`
      ALTER TABLE "buy_orders"
        ADD COLUMN "matched_coin_amount" bigint,
        ADD COLUMN "match_type" "buy_match_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "buy_orders"
        ADD CONSTRAINT "ck_buy_orders_matched_coin_amount"
        CHECK ("matched_coin_amount" IS NULL OR "matched_coin_amount" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        ADD COLUMN "near_match_max_ratio_bps" integer NOT NULL DEFAULT 1000
    `);

    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        ADD CONSTRAINT "ck_matching_policies_near_ratio"
        CHECK (
          "near_match_max_ratio_bps" >= 0
          AND "near_match_max_ratio_bps" <= 10000
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        DROP CONSTRAINT IF EXISTS "ck_matching_policies_near_ratio"
    `);
    await queryRunner.query(`
      ALTER TABLE "matching_policies"
        DROP COLUMN IF EXISTS "near_match_max_ratio_bps"
    `);
    await queryRunner.query(`
      ALTER TABLE "buy_orders"
        DROP CONSTRAINT IF EXISTS "ck_buy_orders_matched_coin_amount"
    `);
    await queryRunner.query(`
      ALTER TABLE "buy_orders"
        DROP COLUMN IF EXISTS "match_type",
        DROP COLUMN IF EXISTS "matched_coin_amount"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "buy_match_type"`);
  }
}
