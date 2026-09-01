import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin P0 foundation:
 * - admin_profiles
 * - user_sessions.previous_refresh_token_hash (refresh reuse detection)
 * - backfill profiles for existing ACTIVE ADMIN / SYS_ADMIN
 */
export class AddAdminProfilesAndSessionReuse1753345000000
  implements MigrationInterface
{
  name = 'AddAdminProfilesAndSessionReuse1753345000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_profiles" (
        "user_id" UUID PRIMARY KEY,
        "admin_level" SMALLINT NOT NULL DEFAULT 1,
        "is_leader" BOOLEAN NOT NULL DEFAULT false,
        "can_view_revenue" BOOLEAN NOT NULL DEFAULT false,
        "can_view_full_identity" BOOLEAN NOT NULL DEFAULT false,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_admin_profiles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_admin_profiles_admin_level"
          CHECK ("admin_level" BETWEEN 1 AND 3)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_admin_profiles_active_level"
        ON "admin_profiles" ("is_active", "admin_level")
    `);

    await queryRunner.query(`
      INSERT INTO "admin_profiles" (
        "user_id",
        "admin_level",
        "is_leader",
        "can_view_revenue",
        "can_view_full_identity",
        "is_active"
      )
      SELECT DISTINCT ON (ur."user_id")
        ur."user_id",
        CASE WHEN ur."role" = 'SYS_ADMIN' THEN 3 ELSE 1 END,
        CASE WHEN ur."role" = 'SYS_ADMIN' THEN true ELSE false END,
        false,
        false,
        true
      FROM "user_roles" ur
      INNER JOIN "users" u ON u."id" = ur."user_id"
      WHERE ur."status" = 'ACTIVE'
        AND ur."role" IN ('ADMIN', 'SYS_ADMIN')
        AND u."status" = 'ACTIVE'
      ORDER BY ur."user_id",
        CASE WHEN ur."role" = 'SYS_ADMIN' THEN 0 ELSE 1 END
      ON CONFLICT ("user_id") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sessions"
        ADD COLUMN "previous_refresh_token_hash" VARCHAR(255)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_sessions_previous_refresh_token_hash"
        ON "user_sessions" ("previous_refresh_token_hash")
        WHERE "previous_refresh_token_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "ux_user_sessions_previous_refresh_token_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_sessions"
        DROP COLUMN IF EXISTS "previous_refresh_token_hash"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_profiles"`);
  }
}
