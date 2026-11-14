import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MC-P9 — 업체 연결 승인 요청 알림 타입.
 * synchronize와 병행될 수 있어 DO 블록으로 멱등.
 */
export class AddPartnerLinkApprovalNotification1753520000000
  implements MigrationInterface
{
  name = 'AddPartnerLinkApprovalNotification1753520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notification_event_type"
          ADD VALUE IF NOT EXISTS 'PARTNER_LINK_APPROVAL_REQUESTED';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notification_reference_type"
          ADD VALUE IF NOT EXISTS 'PARTNER_LINK_SESSION';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(): Promise<void> {
    // Postgres enum 값 제거는 복잡하므로 no-op
  }
}
