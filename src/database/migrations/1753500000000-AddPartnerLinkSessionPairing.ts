import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 연결 OTP(페어링) — 4자리 코드 해시·만료·시도 횟수.
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddPartnerLinkSessionPairing1753500000000
  implements MigrationInterface
{
  name = 'AddPartnerLinkSessionPairing1753500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "pairing_code_hash" VARCHAR(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "pairing_expires_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "pairing_attempt_count" INT NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ADD COLUMN IF NOT EXISTS "pairing_verified_at" TIMESTAMPTZ
    `);
    // 기존 세션이 있으면 OTP 없이 동의되지 않도록 만료된 더미 해시로 채운다.
    await queryRunner.query(`
      UPDATE "partner_link_sessions"
      SET
        "pairing_code_hash" = COALESCE(
          "pairing_code_hash",
          encode(sha256(convert_to("id"::text || ':legacy', 'UTF8')), 'hex')
        ),
        "pairing_expires_at" = COALESCE("pairing_expires_at", "expires_at")
      WHERE "pairing_code_hash" IS NULL OR "pairing_expires_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ALTER COLUMN "pairing_code_hash" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions"
        ALTER COLUMN "pairing_expires_at" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "pairing_verified_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "pairing_attempt_count"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "pairing_expires_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_link_sessions" DROP COLUMN IF EXISTS "pairing_code_hash"
    `);
  }
}
