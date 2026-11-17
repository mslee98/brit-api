import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D26 — CHARGE Intent 금액 Embed lock.
 * amount/fee/total_debit nullable + amount_locked_at.
 */
export class PaymentIntentAmountLock1753600000000
  implements MigrationInterface
{
  name = 'PaymentIntentAmountLock1753600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ALTER COLUMN "amount" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ALTER COLUMN "fee_amount" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ALTER COLUMN "total_debit" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ADD COLUMN IF NOT EXISTS "amount_locked_at" TIMESTAMPTZ
    `);
    // 기존 row는 create 시 금액이 있었으므로 lock 완료로 간주
    await queryRunner.query(`
      UPDATE "partner_payment_intents"
      SET "amount_locked_at" = COALESCE("authorized_at", "created_at")
      WHERE "amount" IS NOT NULL
        AND "amount_locked_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "partner_payment_intents"
      SET
        "amount" = COALESCE("amount", 0),
        "fee_amount" = COALESCE("fee_amount", 0),
        "total_debit" = COALESCE("total_debit", 0)
      WHERE "amount" IS NULL
         OR "fee_amount" IS NULL
         OR "total_debit" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        DROP COLUMN IF EXISTS "amount_locked_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ALTER COLUMN "amount" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ALTER COLUMN "fee_amount" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "partner_payment_intents"
        ALTER COLUMN "total_debit" SET NOT NULL
    `);
  }
}
