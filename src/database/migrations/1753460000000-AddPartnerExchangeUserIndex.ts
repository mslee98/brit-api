import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 사용자 통합 거래내역(GET /v1/me/transactions)에서 업체 전환을 사용자 기준으로 읽는다.
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddPartnerExchangeUserIndex1753460000000 implements MigrationInterface {
  name = 'AddPartnerExchangeUserIndex1753460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_exchanges_user_requested"
        ON "partner_exchanges" ("user_id", "requested_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_partner_exchanges_user_requested"`,
    );
  }
}
