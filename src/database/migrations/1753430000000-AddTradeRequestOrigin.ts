import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * trade_requests.origin — 매칭 후보(MATCHING) / 거래소(MARKET) 진입 구분.
 * dev synchronize로 VARCHAR 컬럼이 먼저 생긴 DB도 enum으로 맞춘다.
 */
export class AddTradeRequestOrigin1753430000000 implements MigrationInterface {
  name = 'AddTradeRequestOrigin1753430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "trade_request_origin" AS ENUM ('MATCHING', 'MARKET');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "trade_requests"
        ADD COLUMN IF NOT EXISTS "origin" "trade_request_origin" NOT NULL DEFAULT 'MATCHING'
    `);
    await queryRunner.query(`
      ALTER TABLE "trade_requests"
        DROP CONSTRAINT IF EXISTS "ck_trade_requests_origin"
    `);
    await queryRunner.query(`
      ALTER TABLE "trade_requests"
        ALTER COLUMN "origin" DROP DEFAULT,
        ALTER COLUMN "origin" TYPE "trade_request_origin"
          USING "origin"::text::"trade_request_origin",
        ALTER COLUMN "origin" SET DEFAULT 'MATCHING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trade_requests" DROP COLUMN IF EXISTS "origin"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "trade_request_origin"`);
  }
}
