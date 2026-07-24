import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitP0Entities1753335000000 implements MigrationInterface {
  name = 'InitP0Entities1753335000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_status" AS ENUM (
        'PENDING',
        'ACTIVE',
        'SUSPENDED',
        'WITHDRAWN'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM (
        'CONSUMER',
        'PARTNER_MEMBER',
        'PARTNER_ADMIN',
        'CS_OPERATOR',
        'DISPUTE_OPERATOR',
        'PLATFORM_ADMIN'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "gender_code" AS ENUM ('M', 'F')
    `);

    await queryRunner.query(`
      CREATE TYPE "mobile_carrier" AS ENUM (
        'SKT',
        'KT',
        'LGU',
        'SKT_MVNO',
        'KT_MVNO',
        'LGU_MVNO'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "user_bank_account_status" AS ENUM (
        'ACTIVE',
        'SUSPENDED',
        'REMOVED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "user_session_status" AS ENUM (
        'ACTIVE',
        'REVOKED',
        'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "login_id" character varying(30) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "phone_e164" character varying(20) NOT NULL,
        "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
        "last_login_at" TIMESTAMPTZ,
        "password_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_users_login_id" ON "users" ("login_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_users_phone_e164" ON "users" ("phone_e164")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_users_status" ON "users" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_profiles" (
        "user_id" uuid NOT NULL,
        "name" character varying(50) NOT NULL,
        "birth_date" date NOT NULL,
        "gender_code" "gender_code" NOT NULL,
        "mobile_carrier" "mobile_carrier" NOT NULL,
        "nickname" character varying(30) NOT NULL,
        "identity_key_hash" character(64) NOT NULL,
        "octomo_request_id" character varying(100),
        "phone_verified_at" TIMESTAMPTZ NOT NULL,
        "identity_verified_at" TIMESTAMPTZ NOT NULL,
        "transaction_pin_hash" character varying(255) NOT NULL,
        "transaction_pin_failed_count" smallint NOT NULL DEFAULT 0,
        "transaction_pin_locked_until" TIMESTAMPTZ,
        "transaction_pin_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "profile_image_path" text,
        "profile_image_updated_at" TIMESTAMPTZ,
        "suspended_reason" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_profiles_user_id" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_user_profiles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_user_profiles_pin_failed_count"
          CHECK ("transaction_pin_failed_count" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_profiles_nickname"
        ON "user_profiles" ("nickname")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_profiles_identity_key_hash"
        ON "user_profiles" ("identity_key_hash")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_profiles_octomo_request_id"
        ON "user_profiles" ("octomo_request_id")
        WHERE "octomo_request_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role" "user_role" NOT NULL,
        "granted_by" uuid,
        "granted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_id", "role"),
        CONSTRAINT "FK_user_roles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_user_roles_role" ON "user_roles" ("role")
    `);

    await queryRunner.query(`
      CREATE TABLE "banks" (
        "id" BIGSERIAL NOT NULL,
        "code" character varying(20) NOT NULL,
        "name" character varying(50) NOT NULL,
        "icon_key" character varying(50) NOT NULL,
        "svg_filename" character varying(255) NOT NULL,
        "daily_maintenance_start" TIME,
        "daily_maintenance_end" TIME,
        "regular_maintenance_rule" character varying(100),
        "regular_maintenance_start" TIME,
        "regular_maintenance_end" TIME,
        "maintenance_note" text,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_banks_id" PRIMARY KEY ("id"),
        CONSTRAINT "ck_banks_daily_maintenance_pair" CHECK (
          (
            "daily_maintenance_start" IS NULL
            AND "daily_maintenance_end" IS NULL
          ) OR (
            "daily_maintenance_start" IS NOT NULL
            AND "daily_maintenance_end" IS NOT NULL
          )
        ),
        CONSTRAINT "ck_banks_regular_maintenance_pair" CHECK (
          (
            "regular_maintenance_start" IS NULL
            AND "regular_maintenance_end" IS NULL
          ) OR (
            "regular_maintenance_start" IS NOT NULL
            AND "regular_maintenance_end" IS NOT NULL
          )
        ),
        CONSTRAINT "ck_banks_regular_rule_required" CHECK (
          (
            "regular_maintenance_start" IS NULL
            AND "regular_maintenance_end" IS NULL
            AND "regular_maintenance_rule" IS NULL
          ) OR (
            "regular_maintenance_start" IS NOT NULL
            AND "regular_maintenance_end" IS NOT NULL
            AND "regular_maintenance_rule" IS NOT NULL
          )
        ),
        CONSTRAINT "ck_banks_sort_order" CHECK ("sort_order" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_banks_code" ON "banks" ("code")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_banks_icon_key" ON "banks" ("icon_key")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_banks_active_sort" ON "banks" ("is_active", "sort_order")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_bank_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "bank_code" character varying(20) NOT NULL,
        "account_number_encrypted" text NOT NULL,
        "account_number_hash" character(64) NOT NULL,
        "account_number_masked" character varying(50) NOT NULL,
        "holder_name" character varying(50) NOT NULL,
        "status" "user_bank_account_status" NOT NULL DEFAULT 'ACTIVE',
        "verified_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_bank_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_bank_accounts_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_bank_accounts_bank_code"
          FOREIGN KEY ("bank_code") REFERENCES "banks"("code") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_bank_accounts_account_number_hash"
        ON "user_bank_accounts" ("account_number_hash")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_bank_accounts_active_user"
        ON "user_bank_accounts" ("user_id")
        WHERE "status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_user_bank_accounts_bank_code"
        ON "user_bank_accounts" ("bank_code")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "refresh_token_hash" character varying(255) NOT NULL,
        "device_id" character varying(100),
        "device_name" character varying(100),
        "user_agent" text,
        "ip_address" inet,
        "status" "user_session_status" NOT NULL DEFAULT 'ACTIVE',
        "expires_at" TIMESTAMPTZ NOT NULL,
        "last_used_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_sessions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_user_sessions_user_status"
        ON "user_sessions" ("user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_user_sessions_expires_at"
        ON "user_sessions" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_user_sessions_refresh_token_hash"
        ON "user_sessions" ("refresh_token_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_bank_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "banks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "user_session_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_bank_account_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mobile_carrier"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gender_code"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status"`);
  }
}
