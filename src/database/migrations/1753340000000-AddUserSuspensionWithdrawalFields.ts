import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * users에 정지·탈퇴 사유 컬럼 추가.
 * - SUSPENDED: suspended_at + suspension_reason 필수
 * - WITHDRAWN: withdrawn_at(기존) + withdrawal_reason 필수
 */
export class AddUserSuspensionWithdrawalFields1753340000000
  implements MigrationInterface
{
  name = 'AddUserSuspensionWithdrawalFields1753340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "suspended_at" TIMESTAMPTZ,
        ADD COLUMN "suspension_reason" VARCHAR(500),
        ADD COLUMN "suspended_by_user_id" UUID,
        ADD COLUMN "withdrawal_reason" VARCHAR(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_suspended_by_user_id"
          FOREIGN KEY ("suspended_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "ck_users_suspended_requires_fields" CHECK (
          "status" <> 'SUSPENDED'
          OR ("suspended_at" IS NOT NULL AND "suspension_reason" IS NOT NULL)
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT "ck_users_withdrawn_requires_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "ck_users_withdrawn_requires_fields" CHECK (
          "status" <> 'WITHDRAWN'
          OR ("withdrawn_at" IS NOT NULL AND "withdrawal_reason" IS NOT NULL)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "ck_users_withdrawn_requires_fields"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "ck_users_withdrawn_requires_at" CHECK (
          "status" <> 'WITHDRAWN' OR "withdrawn_at" IS NOT NULL
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "ck_users_suspended_requires_fields"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "FK_users_suspended_by_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "withdrawal_reason",
        DROP COLUMN IF EXISTS "suspended_by_user_id",
        DROP COLUMN IF EXISTS "suspension_reason",
        DROP COLUMN IF EXISTS "suspended_at"
    `);
  }
}
