import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MC-P9 — Embed claim + 팝업 표시용 평문 코드.
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddPartnerLinkSessionClaim1753510000000
  implements MigrationInterface
{
  name = 'AddPartnerLinkSessionClaim1753510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "pairing_code_plain" VARCHAR(4)
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "claimed_user_id" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "authorization_code_plain" VARCHAR(128)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        DROP COLUMN IF EXISTS "authorization_code_plain"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "claimed_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "claimed_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "pairing_code_plain"
    `);
  }
}
