import dataSource from '../data-source';
import {
  hashSecret,
  hashTransactionPin,
} from '../../common/utils/password.util';

const LOGIN_ID = 'sysadmin';
const PHONE_E164 = '+821099999999';
const RRN = '800101-1000000';
const NAME = '시스템관리자';
const NICKNAME = 'sysadmin';
const PIN = '000000';

/**
 * 로컬/개발용 SYS_ADMIN 멱등 시드.
 *
 * 사용:
 *   SEED_SYS_ADMIN_PASSWORD=... npm run seed:sys-admin
 *
 * - login_id = sysadmin (예약어 admin 회피)
 * - 이미 있으면면 skip
 * - production에서는 SEED_SYS_ADMIN_ALLOW_PRODUCTION=true 없으면 거부
 */
async function seedSysAdmin(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (
    nodeEnv === 'production' &&
    process.env.SEED_SYS_ADMIN_ALLOW_PRODUCTION !== 'true'
  ) {
    throw new Error(
      'production에서 sysadmin 시드는 SEED_SYS_ADMIN_ALLOW_PRODUCTION=true 가 필요합니다.',
    );
  }

  const password = process.env.SEED_SYS_ADMIN_PASSWORD;
  if (!password || password.trim().length < 8) {
    throw new Error(
      'SEED_SYS_ADMIN_PASSWORD 환경변수가 필요합니다 (8자 이상).',
    );
  }

  const pinPepper = process.env.TRANSACTION_PIN_PEPPER;
  if (!pinPepper) {
    throw new Error('TRANSACTION_PIN_PEPPER 환경변수가 필요합니다.');
  }

  await dataSource.initialize();

  try {
    const existing = await dataSource.query(
      `SELECT id FROM users WHERE login_id = $1 LIMIT 1`,
      [LOGIN_ID],
    );
    if (existing.length > 0) {
      const userId = existing[0].id as string;
      const profile = await dataSource.query(
        `SELECT user_id FROM admin_profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (profile.length === 0) {
        await dataSource.query(
          `
          INSERT INTO admin_profiles (
            user_id,
            admin_level,
            is_leader,
            can_view_revenue,
            can_view_full_identity,
            is_active
          )
          VALUES ($1, 3, true, false, false, true)
          `,
          [userId],
        );
        console.log(`[seed:sys-admin] backfilled admin_profiles for ${LOGIN_ID}`);
      } else {
        console.log(`[seed:sys-admin] already exists: ${LOGIN_ID} (${userId})`);
      }
      return;
    }

    const passwordHash = await hashSecret(password.trim());
    const pinHash = await hashTransactionPin(PIN, pinPepper);

    await dataSource.transaction(async (manager) => {
      const inserted: Array<{ id: string }> = await manager.query(
        `
        INSERT INTO users (
          login_id,
          password_hash,
          phone_e164,
          status,
          registration_submitted_at
        )
        VALUES ($1, $2, $3, 'PENDING', now())
        RETURNING id
        `,
        [LOGIN_ID, passwordHash, PHONE_E164],
      );
      const userId = inserted[0].id;

      await manager.query(
        `
        INSERT INTO user_profiles (
          user_id,
          name,
          resident_registration_number,
          birth_date,
          gender_code,
          mobile_carrier,
          nickname,
          pin_hash
        )
        VALUES ($1, $2, $3, $4, 'M', 'SKT', $5, $6)
        `,
        [userId, NAME, RRN, '1980-01-01', NICKNAME, pinHash],
      );

      await manager.query(
        `
        INSERT INTO user_roles (
          user_id,
          role,
          status,
          granted_by_user_id
        )
        VALUES ($1, 'SYS_ADMIN', 'ACTIVE', NULL)
        `,
        [userId],
      );

      await manager.query(
        `
        INSERT INTO admin_profiles (
          user_id,
          admin_level,
          is_leader,
          can_view_revenue,
          can_view_full_identity,
          is_active
        )
        VALUES ($1, 3, true, false, false, true)
        `,
        [userId],
      );

      await manager.query(
        `
        INSERT INTO user_coin_wallets (
          user_id,
          non_sellable_balance,
          sellable_balance,
          locked_non_sellable_balance,
          locked_sellable_balance,
          pending_sellable_balance,
          status
        )
        VALUES ($1, 0, 0, 0, 0, 0, 'ACTIVE')
        `,
        [userId],
      );

      await manager.query(
        `
        UPDATE users
        SET
          status = 'ACTIVE',
          approved_at = now(),
          approved_by_user_id = $1,
          rejected_at = NULL,
          rejection_reason = NULL
        WHERE id = $1
        `,
        [userId],
      );

      console.log(`[seed:sys-admin] created SYS_ADMIN`);
      console.log(`  loginId : ${LOGIN_ID}`);
      console.log(`  userId  : ${userId}`);
      console.log(`  phone   : ${PHONE_E164}`);
      console.log(`  nickname: ${NICKNAME}`);
    });
  } finally {
    await dataSource.destroy();
  }
}

seedSysAdmin().catch((error: unknown) => {
  console.error('[seed:sys-admin] failed:', error);
  process.exitCode = 1;
});
