import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partner admin onboarding (B1):
 * - partners / partner_members
 * - partner_clients + secrets / scopes / origins (스키마만)
 */
export class AddPartnerAdminOnboarding1753380000000
  implements MigrationInterface
{
  name = 'AddPartnerAdminOnboarding1753380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "partners" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" VARCHAR(30) NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "contact_name" VARCHAR(50) NOT NULL,
        "contact_phone" VARCHAR(30) NOT NULL,
        "contact_email" VARCHAR(100) NOT NULL,
        "contact_telegram" VARCHAR(100),
        "memo" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "ck_partners_status"
          CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'TERMINATED'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partners_code" ON "partners" ("code")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partners_status" ON "partners" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_members" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "role" VARCHAR(20) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "invited_by_user_id" UUID,
        "joined_at" TIMESTAMPTZ,
        "removed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_members_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_members_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_partner_members_invited_by_user_id"
          FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_partner_members_role"
          CHECK ("role" IN ('OWNER', 'MANAGER')),
        CONSTRAINT "ck_partner_members_status"
          CHECK ("status" IN ('ACTIVE', 'REMOVED'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_members_active_user"
        ON "partner_members" ("user_id")
        WHERE "status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_members_active_partner_user"
        ON "partner_members" ("partner_id", "user_id")
        WHERE "status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_members_partner_status"
        ON "partner_members" ("partner_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_members_user_status"
        ON "partner_members" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_clients" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_id" UUID NOT NULL,
        "client_id" VARCHAR(64) NOT NULL,
        "client_type" VARCHAR(20) NOT NULL,
        "environment" VARCHAR(20) NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        "webhook_url" VARCHAR(500),
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_partner_clients_partner_id"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_clients_client_type"
          CHECK ("client_type" IN ('SERVER', 'PUBLIC_SDK')),
        CONSTRAINT "ck_partner_clients_environment"
          CHECK ("environment" IN ('SANDBOX', 'PRODUCTION')),
        CONSTRAINT "ck_partner_clients_status"
          CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'REVOKED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_partner_clients_client_id"
        ON "partner_clients" ("client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_clients_partner_status"
        ON "partner_clients" ("partner_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_client_secrets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "partner_client_id" UUID NOT NULL,
        "secret_type" VARCHAR(30) NOT NULL,
        "secret_hash" VARCHAR(255) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        "expires_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "revoked_at" TIMESTAMPTZ,
        CONSTRAINT "FK_partner_client_secrets_client_id"
          FOREIGN KEY ("partner_client_id") REFERENCES "partner_clients"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_partner_client_secrets_type"
          CHECK ("secret_type" IN ('API_SECRET', 'WEBHOOK_SECRET')),
        CONSTRAINT "ck_partner_client_secrets_status"
          CHECK ("status" IN ('ACTIVE', 'REVOKED'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_partner_client_secrets_client_status"
        ON "partner_client_secrets" ("partner_client_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_client_scopes" (
        "partner_client_id" UUID NOT NULL,
        "scope_code" VARCHAR(40) NOT NULL,
        PRIMARY KEY ("partner_client_id", "scope_code"),
        CONSTRAINT "FK_partner_client_scopes_client_id"
          FOREIGN KEY ("partner_client_id") REFERENCES "partner_clients"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_partner_client_scopes_code"
          CHECK ("scope_code" IN (
            'USER_LINK',
            'BALANCE_READ',
            'EXCHANGE_CHARGE',
            'EXCHANGE_REDEEM',
            'STATUS_READ'
          ))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_client_origins" (
        "partner_client_id" UUID NOT NULL,
        "origin" VARCHAR(255) NOT NULL,
        PRIMARY KEY ("partner_client_id", "origin"),
        CONSTRAINT "FK_partner_client_origins_client_id"
          FOREIGN KEY ("partner_client_id") REFERENCES "partner_clients"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_client_origins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_client_scopes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_client_secrets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_clients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partners"`);
  }
}
