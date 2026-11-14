import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POL-LINK-001: 업체별 ACTIVE 연결만 유일하게 한다.
 * - (partner_id, partner_user_key) ACTIVE 1개 — 업체 회원 키는 BRIT 사용자 1명에게만
 * - (partner_id, user_id) ACTIVE 1개 — BRIT 사용자는 같은 업체 회원 계정 1개만
 * UNLINKED 행은 이력으로 남기고, 같은 키·사용자로 신규 연결을 허용한다.
 * synchronize와 병행될 수 있어 IF EXISTS / IF NOT EXISTS로 멱등.
 */
export class ScopeUserPartnerLinkActiveUnique1753470000000
  implements MigrationInterface
{
  name = 'ScopeUserPartnerLinkActiveUnique1753470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ux_user_partner_links_partner_user_key"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_partner_links_partner_key_active"
        ON "user_partner_links" ("partner_id", "partner_user_key")
        WHERE "status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_partner_links_partner_user_active"
        ON "user_partner_links" ("partner_id", "user_id")
        WHERE "status" = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ux_user_partner_links_partner_user_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ux_user_partner_links_partner_key_active"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_partner_links_partner_user_key"
        ON "user_partner_links" ("partner_id", "partner_user_key")
    `);
  }
}
