import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 최종 사용자 계정 연결 세션 (OAuth authorization code 방식, POL-LINK-001).
 * synchronize와 병행될 수 있어 IF NOT EXISTS로 멱등.
 */
export class AddPartnerLinkSessions1753480000000 implements MigrationInterface {
  name = 'AddPartnerLinkSessions1753480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_link_sessions" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "partner_id" UUID NOT NULL,
        "partner_client_id" UUID NOT NULL,
        "partner_user_key" VARCHAR(255) NOT NULL,
        "partner_user_label" VARCHAR(100),
        "return_origin" VARCHAR(255) NOT NULL,
        "session_token_hash" VARCHAR(64) NOT NULL,
        "authorization_code_hash" VARCHAR(64),
        "code_expires_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "consented_user_id" UUID,
        "user_partner_link_id" UUID,
        "consented_at" TIMESTAMPTZ,
        "rejected_at" TIMESTAMPTZ,
        "exchanged_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_link_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_link_sessions_partner"
          FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_partner_link_sessions_client"
          FOREIGN KEY ("partner_client_id") REFERENCES "partner_clients"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_partner_link_sessions_user"
          FOREIGN KEY ("consented_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_partner_link_sessions_link"
          FOREIGN KEY ("user_partner_link_id") REFERENCES "user_partner_links"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_partner_link_sessions_status"
          CHECK ("status" IN ('PENDING', 'CONSENTED', 'REJECTED', 'EXCHANGED', 'EXPIRED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_link_sessions_token_hash"
        ON "partner_link_sessions" ("session_token_hash")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_partner_link_sessions_code_hash"
        ON "partner_link_sessions" ("authorization_code_hash")
        WHERE "authorization_code_hash" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_partner_link_sessions_partner_created"
        ON "partner_link_sessions" ("partner_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_link_sessions"`);
  }
}
