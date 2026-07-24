import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsentsIdentityBanksSeed1753335600000
  implements MigrationInterface
{
  name = 'AddConsentsIdentityBanksSeed1753335600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "identity_verification_provider" AS ENUM ('OCTOMO')
    `);

    await queryRunner.query(`
      CREATE TABLE "identity_verifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "provider" "identity_verification_provider" NOT NULL,
        "request_id" character varying(100),
        "phone_e164" character varying(20) NOT NULL,
        "verified_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_identity_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_identity_verifications_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_identity_verifications_request_id"
        ON "identity_verifications" ("request_id")
        WHERE "request_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_identity_verifications_user_id"
        ON "identity_verifications" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_consents" (
        "user_id" uuid NOT NULL,
        "service" boolean NOT NULL,
        "privacy" boolean NOT NULL,
        "identity" boolean NOT NULL,
        "marketing" boolean NOT NULL DEFAULT false,
        "agreed_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_consents_user_id" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_user_consents_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      INSERT INTO "banks" (
        "code", "name", "icon_key", "svg_filename",
        "sort_order", "is_active"
      ) VALUES
        ('090', '카카오뱅크', 'kakao', 'kakao.svg', 10, true),
        ('088', '신한은행', 'shinhan', 'shinhan.svg', 20, true),
        ('004', 'KB국민은행', 'kb', 'kb.svg', 30, true),
        ('020', '우리은행', 'woori', 'woori.svg', 40, true),
        ('081', '하나은행', 'hana', 'hana.svg', 50, true),
        ('011', 'NH농협은행', 'nh', 'nh.svg', 60, true),
        ('003', 'IBK기업은행', 'ibk', 'ibk.svg', 70, true),
        ('092', '토스뱅크', 'toss', 'toss.svg', 80, true)
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "banks"
      WHERE "code" IN ('090','088','004','020','081','011','003','092')
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_consents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "identity_verifications"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "identity_verification_provider"`,
    );
  }
}
