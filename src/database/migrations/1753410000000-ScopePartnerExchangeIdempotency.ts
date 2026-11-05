import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * partner_exchanges.idempotency_key 를 업체 스코프 unique로 변경.
 * 서로 다른 업체가 같은 키를 써도 충돌하지 않는다.
 */
export class ScopePartnerExchangeIdempotency1753410000000
  implements MigrationInterface
{
  name = 'ScopePartnerExchangeIdempotency1753410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "ux_partner_exchanges_idempotency_key"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_exchanges_partner_idempotency"
        ON "partner_exchanges" ("partner_id", "idempotency_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "ux_partner_exchanges_partner_idempotency"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_exchanges_idempotency_key"
        ON "partner_exchanges" ("idempotency_key")
    `);
  }
}
