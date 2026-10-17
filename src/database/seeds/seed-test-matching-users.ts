import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';

import { AppModule } from '../../app.module';
import {
  encryptAccountNumber,
  hashAccountNumber,
  maskAccountNumber,
} from '../../common/utils/account-crypto.util';
import {
  hashSecret,
  hashTransactionPin,
} from '../../common/utils/password.util';
import { CoinService } from '../../modules/coins/coin.service';
import { CoinLedgerEntryType } from '../../modules/coins/domain/enums/coin-ledger-entry-type.enum';
import { CoinSourceType } from '../../modules/coins/domain/enums/coin-source-type.enum';
import { SellOrderService } from '../../modules/orders/sell-order.service';
import dataSource from '../data-source';

const DEFAULT_PASSWORD = '공통12!@';
const PIN = '611390';
const BANK_CODE = '090';

type SellerSeed = {
  loginId: string;
  coinAmount: string;
  phoneE164: string;
  rrn: string;
  birthDate: string;
  nickname: string;
  name: string;
  accountNumber: string;
};

/** test01(구매자) 매칭 테스트용 판매자 5명 — 27~31만원 매물 */
const SELLERS: SellerSeed[] = [
  {
    loginId: 'test02',
    coinAmount: '270000',
    phoneE164: '+821010000002',
    rrn: '900102-1000002',
    birthDate: '1990-01-02',
    nickname: '테스트02',
    name: '테스트02',
    accountNumber: '3333012345602',
  },
  {
    loginId: 'test03',
    coinAmount: '280000',
    phoneE164: '+821010000003',
    rrn: '900103-2000003',
    birthDate: '1990-01-03',
    nickname: '테스트03',
    name: '테스트03',
    accountNumber: '3333012345603',
  },
  {
    loginId: 'test04',
    coinAmount: '290000',
    phoneE164: '+821010000004',
    rrn: '900104-1000004',
    birthDate: '1990-01-04',
    nickname: '테스트04',
    name: '테스트04',
    accountNumber: '3333012345604',
  },
  {
    loginId: 'test05',
    coinAmount: '300000',
    phoneE164: '+821010000005',
    rrn: '900105-2000005',
    birthDate: '1990-01-05',
    nickname: '테스트05',
    name: '테스트05',
    accountNumber: '3333012345605',
  },
  {
    loginId: 'test06',
    coinAmount: '310000',
    phoneE164: '+821010000006',
    rrn: '900106-1000006',
    birthDate: '1990-01-06',
    nickname: '테스트06',
    name: '테스트06',
    accountNumber: '3333012345606',
  },
];

function sellOrderIdempotencyKey(loginId: string): string {
  return `seed-test-matching-${loginId}`;
}

async function findUserIdByLoginId(
  manager: EntityManager,
  loginId: string,
): Promise<string | null> {
  const rows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM users WHERE login_id = $1 LIMIT 1`,
    [loginId.toLowerCase()],
  );
  return rows[0]?.id ?? null;
}

async function ensureSellerUser(
  manager: EntityManager,
  seller: SellerSeed,
  passwordHash: string,
  pinHash: string,
  accountNumberEncrypted: Buffer,
  accountNumberHash: string,
  accountNumberMasked: string,
  approvedByUserId: string | null,
): Promise<string> {
  const existingId = await findUserIdByLoginId(manager, seller.loginId);
  if (existingId) {
    await manager.query(
      `UPDATE user_profiles SET pin_hash = $2 WHERE user_id = $1`,
      [existingId, pinHash],
    );
    console.log(`[seed:test-matching] user exists: ${seller.loginId} (${existingId})`);
    return existingId;
  }

  const inserted: Array<{ id: string }> = await manager.query(
    `
    INSERT INTO users (
      login_id,
      password_hash,
      phone_e164,
      status,
      registration_submitted_at,
      approved_at,
      approved_by_user_id
    )
    VALUES ($1, $2, $3, 'ACTIVE', now(), now(), $4)
    RETURNING id
    `,
    [
      seller.loginId.toLowerCase(),
      passwordHash,
      seller.phoneE164,
      approvedByUserId,
    ],
  );
  const userId = inserted[0].id;

  if (!approvedByUserId) {
    await manager.query(
      `UPDATE users SET approved_by_user_id = $1 WHERE id = $1`,
      [userId],
    );
    approvedByUserId = userId;
  }

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
    [
      userId,
      seller.name,
      seller.rrn,
      seller.birthDate,
      seller.nickname,
      pinHash,
    ],
  );

  await manager.query(
    `
    INSERT INTO user_roles (user_id, role, status, granted_by_user_id)
    VALUES ($1, 'USER', 'ACTIVE', NULL)
    `,
    [userId],
  );

  const now = new Date();
  await manager.query(
    `
    INSERT INTO user_bank_accounts (
      user_id,
      bank_code,
      account_number_encrypted,
      account_number_hash,
      account_number_masked,
      holder_name,
      status,
      requested_at,
      reviewed_at,
      reviewed_by_user_id,
      activated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7, $8, $7)
    `,
    [
      userId,
      BANK_CODE,
      accountNumberEncrypted,
      accountNumberHash,
      accountNumberMasked,
      seller.name,
      now,
      approvedByUserId,
    ],
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

  console.log(`[seed:test-matching] created user: ${seller.loginId} (${userId})`);
  return userId;
}

async function hasSeedSellOrder(
  userId: string,
  loginId: string,
): Promise<boolean> {
  const rows: Array<{ id: string }> = await dataSource.query(
    `
    SELECT id
    FROM sell_orders
    WHERE seller_user_id = $1
      AND idempotency_key = $2
    LIMIT 1
    `,
    [userId, sellOrderIdempotencyKey(loginId)],
  );
  return rows.length > 0;
}

async function getSellableBalance(
  manager: EntityManager,
  userId: string,
): Promise<bigint> {
  const rows: Array<{ sellable_balance: string }> = await manager.query(
    `SELECT sellable_balance FROM user_coin_wallets WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return BigInt(rows[0]?.sellable_balance ?? '0');
}

async function ensureSellableCoins(
  coinService: CoinService,
  userId: string,
  requiredAmount: string,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const available = await getSellableBalance(manager, userId);
    const required = BigInt(requiredAmount);
    if (available >= required) {
      return;
    }

    const creditAmount = (required - available).toString();
    await coinService.creditSellable(manager, {
      userId,
      amount: creditAmount,
      sourceType: CoinSourceType.ADMIN_ADJUSTMENT,
      sourceId: null,
      entryType: CoinLedgerEntryType.ADMIN_CREDIT,
      referenceType: 'SEED',
      referenceId: randomUUID(),
      description: 'seed-test-matching-users',
      isSellable: true,
    });
    console.log(
      `[seed:test-matching] credited ${creditAmount} sellable coins for ${userId}`,
    );
  });
}

async function seedTestMatchingUsers(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (
    nodeEnv === 'production' &&
    process.env.SEED_TEST_MATCHING_ALLOW_PRODUCTION !== 'true'
  ) {
    throw new Error(
      'production에서 test-matching 시드는 SEED_TEST_MATCHING_ALLOW_PRODUCTION=true 가 필요합니다.',
    );
  }

  const password =
    process.env.SEED_TEST_PASSWORD?.trim() || DEFAULT_PASSWORD;
  if (!password) {
    throw new Error('비밀번호가 비어 있습니다.');
  }

  const pinPepper = process.env.TRANSACTION_PIN_PEPPER;
  const encryptionKey = process.env.ACCOUNT_ENCRYPTION_KEY;
  const identityPepper = process.env.IDENTITY_PEPPER;
  if (!pinPepper || !encryptionKey || !identityPepper) {
    throw new Error(
      'TRANSACTION_PIN_PEPPER, ACCOUNT_ENCRYPTION_KEY, IDENTITY_PEPPER 환경변수가 필요합니다.',
    );
  }

  const passwordHash = await hashSecret(password);
  const pinHash = await hashTransactionPin(PIN, pinPepper);

  await dataSource.initialize();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const coinService = app.get(CoinService);
    const sellOrderService = app.get(SellOrderService);

    const sysadminRows: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM users WHERE login_id = 'sysadmin' LIMIT 1`,
    );
    let approvedByUserId: string | null = sysadminRows[0]?.id ?? null;

    for (const seller of SELLERS) {
      const accountNumberEncrypted = encryptAccountNumber(
        seller.accountNumber,
        encryptionKey,
      );
      const accountNumberHash = hashAccountNumber(
        seller.accountNumber,
        identityPepper,
      );
      const accountNumberMasked = maskAccountNumber(seller.accountNumber);

      const userId = await dataSource.transaction(async (manager) =>
        ensureSellerUser(
          manager,
          seller,
          passwordHash,
          pinHash,
          accountNumberEncrypted,
          accountNumberHash,
          accountNumberMasked,
          approvedByUserId,
        ),
      );

      if (!approvedByUserId) {
        approvedByUserId = userId;
      }

      if (await hasSeedSellOrder(userId, seller.loginId)) {
        console.log(
          `[seed:test-matching] sell order already exists: ${seller.loginId}`,
        );
        continue;
      }

      await ensureSellableCoins(coinService, userId, seller.coinAmount);

      const sellOrder = await sellOrderService.createSellOrder(
        userId,
        { coinAmount: seller.coinAmount },
        sellOrderIdempotencyKey(seller.loginId),
      );

      console.log(
        `[seed:test-matching] sell order: ${seller.loginId} ${sellOrder.orderNumber} (${seller.coinAmount} Coin)`,
      );
    }

    console.log('');
    console.log('[seed:test-matching] done');
    console.log(`  password : ${password}`);
    console.log(`  pin      : ${PIN}`);
    console.log('  buyers   : test01 로 30만원 구매 시 5건 listFocused 확인 가능');
    console.log('  sellers  : test02(27만) test03(28만) test04(29만) test05(30만) test06(31만)');
  } finally {
    await app.close();
    await dataSource.destroy();
  }
}

seedTestMatchingUsers().catch((error: unknown) => {
  console.error('[seed:test-matching] failed:', error);
  process.exitCode = 1;
});
