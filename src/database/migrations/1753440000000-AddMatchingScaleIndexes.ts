import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 동시 매칭 규모 대비 부분 인덱스.
 * - 후보 조회: 매칭 가능한 판매 잔량 범위 스캔
 * - 후보 변경 신호: MATCHING 구매 금액 범위 조회
 * - 판매자 완료 거래 수(LATERAL COUNT)
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddMatchingScaleIndexes1753440000000 implements MigrationInterface {
  name = 'AddMatchingScaleIndexes1753440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_sell_orders_matchable_remaining"
        ON "sell_orders" ("remaining_coin_amount")
        WHERE "status" IN ('OPEN', 'PARTIALLY_MATCHED')
          AND "cancelled_at" IS NULL
          AND "remaining_coin_amount" > 0
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_buy_orders_matching_amount"
        ON "buy_orders" ("coin_amount")
        WHERE "status" = 'MATCHING'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_trades_seller_completed"
        ON "trades" ("seller_user_id")
        WHERE "status" = 'COMPLETED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_trades_seller_completed"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_buy_orders_matching_amount"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_sell_orders_matchable_remaining"`,
    );
  }
}
