import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sell cancel 시 remaining→0 만으로는 amount_sum 제약이 깨진다.
 * cancelled_coin_amount 버킷을 추가해
 * original = remaining + reserved + completed + cancelled 로 맞춘다.
 */
export class AddSellOrderCancelledAmount1753351000000
  implements MigrationInterface
{
  name = 'AddSellOrderCancelledAmount1753351000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      ADD COLUMN IF NOT EXISTS "cancelled_coin_amount" BIGINT NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "sell_orders"
      SET "cancelled_coin_amount" = GREATEST(
        0,
        "original_coin_amount"
          - "remaining_coin_amount"
          - "reserved_coin_amount"
          - "completed_coin_amount"
      )
      WHERE "cancelled_coin_amount" = 0
        AND "original_coin_amount"
          <> ("remaining_coin_amount" + "reserved_coin_amount" + "completed_coin_amount")
    `);

    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      DROP CONSTRAINT IF EXISTS "ck_sell_orders_amounts_non_negative"
    `);
    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      ADD CONSTRAINT "ck_sell_orders_amounts_non_negative" CHECK (
        "remaining_coin_amount" >= 0
        AND "reserved_coin_amount" >= 0
        AND "completed_coin_amount" >= 0
        AND "cancelled_coin_amount" >= 0
        AND "minimum_trade_amount" > 0
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      DROP CONSTRAINT IF EXISTS "ck_sell_orders_amount_sum"
    `);
    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      ADD CONSTRAINT "ck_sell_orders_amount_sum" CHECK (
        "original_coin_amount"
          = "remaining_coin_amount"
          + "reserved_coin_amount"
          + "completed_coin_amount"
          + "cancelled_coin_amount"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      DROP CONSTRAINT IF EXISTS "ck_sell_orders_amount_sum"
    `);
    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      ADD CONSTRAINT "ck_sell_orders_amount_sum" CHECK (
        "original_coin_amount"
          = "remaining_coin_amount"
          + "reserved_coin_amount"
          + "completed_coin_amount"
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      DROP CONSTRAINT IF EXISTS "ck_sell_orders_amounts_non_negative"
    `);
    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      ADD CONSTRAINT "ck_sell_orders_amounts_non_negative" CHECK (
        "remaining_coin_amount" >= 0
        AND "reserved_coin_amount" >= 0
        AND "completed_coin_amount" >= 0
        AND "minimum_trade_amount" > 0
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "sell_orders"
      DROP COLUMN IF EXISTS "cancelled_coin_amount"
    `);
  }
}
