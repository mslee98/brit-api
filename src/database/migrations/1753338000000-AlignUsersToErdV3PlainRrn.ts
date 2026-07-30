import { MigrationInterface, QueryRunner } from 'typeorm';

import { SeedBanksFull1753336800000 } from './1753336800000-SeedBanksFull';

/**
 * P0 → ERD v3(users ~ user_coin_wallets) 파괴적 재정렬.
 *
 * 무엇을 하나:
 * 1) 기존 users 관련 테이블·구 enum DROP
 * 2) ERD enum/테이블 CREATE (주민번호 평문, 심사·지갑 포함)
 * 3) SeedBanksFull로 banks 재시드
 *
 * 주의: 기존 사용자 데이터는 보존하지 않는다. 로컬/초기 단계용.
 * down()은 지원하지 않음 — 필요 시 DB reset 후 전체 migrate.
 */
export class AlignUsersToErdV3PlainRrn1753338000000
  implements MigrationInterface
{
  name = 'AlignUsersToErdV3PlainRrn1753338000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
    );

    await queryRunner.query(
      `DROP TABLE IF EXISTS "user_approval_reviews" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "user_bank_account_reviews" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "user_coin_wallets" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_consents" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "identity_verifications" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "user_bank_accounts" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "banks" CASCADE`);

    await queryRunner.query(`DROP TYPE IF EXISTS "user_status" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role" CASCADE`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_bank_account_status" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_session_status" CASCADE`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "session_status" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gender_code" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mobile_carrier" CASCADE`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "identity_verification_provider" CASCADE`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "role_grant_status" CASCADE`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "approval_decision" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bank_account_status" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "bank_account_review_decision" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "coin_wallet_status" CASCADE`,
    );

    await queryRunner.query(
      `CREATE TYPE "user_status" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "approval_decision" AS ENUM ('APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN', 'SYS_ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "role_grant_status" AS ENUM ('ACTIVE', 'REVOKED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "session_status" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_account_status" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'CLOSED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bank_account_review_decision" AS ENUM ('APPROVED', 'REJECTED', 'SUSPENDED', 'REACTIVATED', 'RETIRED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "coin_wallet_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "banks" (
        "id" SMALLSERIAL PRIMARY KEY,
        "code" VARCHAR(20) NOT NULL,
        "name" VARCHAR(50) NOT NULL,
        "icon_key" VARCHAR(50),
        "svg_filename" VARCHAR(255),
        "daily_maintenance_start" TIME,
        "daily_maintenance_end" TIME,
        "regular_maintenance_rule" VARCHAR(100),
        "regular_maintenance_start" TIME,
        "regular_maintenance_end" TIME,
        "maintenance_note" TEXT,
        "sort_order" SMALLINT NOT NULL DEFAULT 0,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "ux_banks_code" UNIQUE ("code"),
        CONSTRAINT "ux_banks_icon_key" UNIQUE ("icon_key"),
        CONSTRAINT "ck_banks_sort_order" CHECK ("sort_order" >= 0),
        CONSTRAINT "ck_banks_daily_maintenance_pair" CHECK (
          ("daily_maintenance_start" IS NULL AND "daily_maintenance_end" IS NULL)
          OR ("daily_maintenance_start" IS NOT NULL AND "daily_maintenance_end" IS NOT NULL)
        ),
        CONSTRAINT "ck_banks_regular_maintenance_pair" CHECK (
          ("regular_maintenance_start" IS NULL AND "regular_maintenance_end" IS NULL)
          OR ("regular_maintenance_start" IS NOT NULL AND "regular_maintenance_end" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_banks_active_sort" ON "banks" ("is_active", "sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "login_id" VARCHAR(30) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "phone_e164" VARCHAR(20) NOT NULL,
        "status" "user_status" NOT NULL DEFAULT 'PENDING',
        "registration_submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "approved_at" TIMESTAMPTZ,
        "approved_by_user_id" UUID,
        "rejected_at" TIMESTAMPTZ,
        "rejection_reason" VARCHAR(500),
        "last_login_at" TIMESTAMPTZ,
        "password_changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "withdrawn_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "ux_users_login_id" UNIQUE ("login_id"),
        CONSTRAINT "ux_users_phone_e164" UNIQUE ("phone_e164"),
        CONSTRAINT "FK_users_approved_by_user_id"
          FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_users_active_requires_approval" CHECK (
          "status" <> 'ACTIVE' OR ("approved_at" IS NOT NULL AND "approved_by_user_id" IS NOT NULL)
        ),
        CONSTRAINT "ck_users_rejected_requires_reason" CHECK (
          "status" <> 'REJECTED' OR ("rejected_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)
        ),
        CONSTRAINT "ck_users_withdrawn_requires_at" CHECK (
          "status" <> 'WITHDRAWN' OR "withdrawn_at" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_users_status" ON "users" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_profiles" (
        "user_id" UUID PRIMARY KEY,
        "name" VARCHAR(50) NOT NULL,
        "resident_registration_number" CHAR(14) NOT NULL,
        "birth_date" DATE NOT NULL,
        "gender_code" CHAR(1) NOT NULL,
        "mobile_carrier" VARCHAR(20) NOT NULL,
        "nickname" VARCHAR(30),
        "pin_hash" VARCHAR(255) NOT NULL,
        "pin_failed_count" SMALLINT NOT NULL DEFAULT 0,
        "pin_locked_until" TIMESTAMPTZ,
        "pin_changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "profile_image_path" TEXT,
        "profile_image_updated_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_profiles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ux_user_profiles_resident_registration_number"
          UNIQUE ("resident_registration_number"),
        CONSTRAINT "ux_user_profiles_nickname" UNIQUE ("nickname"),
        CONSTRAINT "ck_user_profiles_pin_failed_count" CHECK ("pin_failed_count" >= 0),
        CONSTRAINT "ck_user_profiles_rrn_format" CHECK (
          "resident_registration_number" ~ '^[0-9]{6}-[0-9]{7}$'
        ),
        CONSTRAINT "ck_user_profiles_gender_code" CHECK ("gender_code" IN ('M', 'F'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "role" "user_role" NOT NULL,
        "status" "role_grant_status" NOT NULL DEFAULT 'ACTIVE',
        "granted_by_user_id" UUID,
        "granted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "revoked_by_user_id" UUID,
        "revoked_at" TIMESTAMPTZ,
        "revoke_reason" VARCHAR(500),
        CONSTRAINT "FK_user_roles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_roles_granted_by_user_id"
          FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_user_roles_revoked_by_user_id"
          FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_user_roles_revoked_requires_at" CHECK (
          "status" <> 'REVOKED' OR "revoked_at" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_user_roles_user_id" ON "user_roles" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_user_roles_role" ON "user_roles" ("role")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_consents" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "consent_type" VARCHAR(30) NOT NULL,
        "document_version" VARCHAR(30) NOT NULL,
        "is_agreed" BOOLEAN NOT NULL,
        "agreed_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_consents_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ux_user_consents_user_type_version"
          UNIQUE ("user_id", "consent_type", "document_version"),
        CONSTRAINT "ck_user_consents_type" CHECK (
          "consent_type" IN ('SERVICE','PRIVACY','UNIQUE_IDENTIFIER','BANK_ACCOUNT','MARKETING')
        ),
        CONSTRAINT "ck_user_consents_agreed_requires_at" CHECK (
          "is_agreed" = false OR "agreed_at" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "refresh_token_hash" VARCHAR(255) NOT NULL,
        "device_id" VARCHAR(100),
        "device_name" VARCHAR(100),
        "user_agent" TEXT,
        "ip_address" INET,
        "status" "session_status" NOT NULL DEFAULT 'ACTIVE',
        "expires_at" TIMESTAMPTZ NOT NULL,
        "last_used_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "revoke_reason" VARCHAR(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_sessions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ux_user_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "ck_user_sessions_revoked" CHECK (
          "status" <> 'REVOKED' OR "revoked_at" IS NOT NULL
        ),
        CONSTRAINT "ck_user_sessions_expires_after_created" CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_user_sessions_user_status" ON "user_sessions" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_user_sessions_expires_at" ON "user_sessions" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_bank_accounts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "bank_code" VARCHAR(20) NOT NULL,
        "account_number_encrypted" BYTEA NOT NULL,
        "account_number_hash" CHAR(64) NOT NULL,
        "account_number_masked" VARCHAR(50) NOT NULL,
        "holder_name" VARCHAR(50) NOT NULL,
        "status" "bank_account_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
        "replaces_bank_account_id" UUID,
        "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "reviewed_at" TIMESTAMPTZ,
        "reviewed_by_user_id" UUID,
        "rejection_reason" VARCHAR(500),
        "activated_at" TIMESTAMPTZ,
        "suspended_at" TIMESTAMPTZ,
        "retired_at" TIMESTAMPTZ,
        "closed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_bank_accounts_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_bank_accounts_bank_code"
          FOREIGN KEY ("bank_code") REFERENCES "banks"("code") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_bank_accounts_replaces"
          FOREIGN KEY ("replaces_bank_account_id") REFERENCES "user_bank_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_bank_accounts_reviewed_by"
          FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ux_user_bank_accounts_account_number_hash" UNIQUE ("account_number_hash"),
        CONSTRAINT "ux_user_bank_accounts_id_user_id" UNIQUE ("id", "user_id"),
        CONSTRAINT "ck_user_bank_accounts_active" CHECK (
          "status" <> 'ACTIVE'
          OR ("reviewed_at" IS NOT NULL AND "reviewed_by_user_id" IS NOT NULL AND "activated_at" IS NOT NULL)
        ),
        CONSTRAINT "ck_user_bank_accounts_rejected" CHECK (
          "status" <> 'REJECTED'
          OR ("reviewed_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_user_bank_accounts_bank_code" ON "user_bank_accounts" ("bank_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_user_bank_accounts_user_id" ON "user_bank_accounts" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_approval_reviews" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "bank_account_id" UUID NOT NULL,
        "decision" "approval_decision" NOT NULL,
        "identity_checked" BOOLEAN NOT NULL DEFAULT false,
        "phone_checked" BOOLEAN NOT NULL DEFAULT false,
        "bank_account_checked" BOOLEAN NOT NULL DEFAULT false,
        "holder_name_matched" BOOLEAN NOT NULL DEFAULT false,
        "reviewed_by_user_id" UUID NOT NULL,
        "review_reason" VARCHAR(500),
        "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_approval_reviews_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_approval_reviews_reviewed_by"
          FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_approval_reviews_bank_account"
          FOREIGN KEY ("bank_account_id", "user_id")
          REFERENCES "user_bank_accounts"("id", "user_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_user_approval_reviews_not_self" CHECK ("user_id" <> "reviewed_by_user_id"),
        CONSTRAINT "ck_user_approval_reviews_approved" CHECK (
          "decision" <> 'APPROVED'
          OR ("identity_checked" AND "phone_checked" AND "bank_account_checked" AND "holder_name_matched")
        ),
        CONSTRAINT "ck_user_approval_reviews_rejected" CHECK (
          "decision" <> 'REJECTED' OR "review_reason" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_bank_account_reviews" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "bank_account_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "previous_status" "bank_account_status" NOT NULL,
        "decision" "bank_account_review_decision" NOT NULL,
        "resulting_status" "bank_account_status" NOT NULL,
        "reviewed_by_user_id" UUID NOT NULL,
        "review_reason" VARCHAR(500),
        "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_bank_account_reviews_bank_account"
          FOREIGN KEY ("bank_account_id", "user_id")
          REFERENCES "user_bank_accounts"("id", "user_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_bank_account_reviews_reviewed_by"
          FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_user_bank_account_reviews_not_self" CHECK ("user_id" <> "reviewed_by_user_id"),
        CONSTRAINT "ck_user_bank_account_reviews_rejected" CHECK (
          "decision" <> 'REJECTED' OR "review_reason" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_coin_wallets" (
        "user_id" UUID PRIMARY KEY,
        "non_sellable_balance" BIGINT NOT NULL DEFAULT 0,
        "sellable_balance" BIGINT NOT NULL DEFAULT 0,
        "locked_non_sellable_balance" BIGINT NOT NULL DEFAULT 0,
        "locked_sellable_balance" BIGINT NOT NULL DEFAULT 0,
        "pending_sellable_balance" BIGINT NOT NULL DEFAULT 0,
        "status" "coin_wallet_status" NOT NULL DEFAULT 'ACTIVE',
        "version" BIGINT NOT NULL DEFAULT 0,
        "suspended_at" TIMESTAMPTZ,
        "suspended_reason" VARCHAR(500),
        "closed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_coin_wallets_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_user_coin_wallets_non_sellable" CHECK ("non_sellable_balance" >= 0),
        CONSTRAINT "ck_user_coin_wallets_sellable" CHECK ("sellable_balance" >= 0),
        CONSTRAINT "ck_user_coin_wallets_locked_non_sellable" CHECK ("locked_non_sellable_balance" >= 0),
        CONSTRAINT "ck_user_coin_wallets_locked_sellable" CHECK ("locked_sellable_balance" >= 0),
        CONSTRAINT "ck_user_coin_wallets_pending_sellable" CHECK ("pending_sellable_balance" >= 0),
        CONSTRAINT "ck_user_coin_wallets_version" CHECK ("version" >= 0)
      )
    `);

    const banksSeed = new SeedBanksFull1753336800000();
    await banksSeed.up(queryRunner);
  }

  public async down(): Promise<void> {
    // 파괴적 정렬 마이그레이션 — 이전 P0 스키마로의 자동 복원은 지원하지 않는다.
  }
}
