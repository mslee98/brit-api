import { existsSync } from 'fs';
import { resolve } from 'path';

import { config as loadEnv } from 'dotenv';

/**
 * 소켓 게이트웨이 데코레이터가 CORS_ORIGINS를 읽기 전에 환경 파일을 올린다.
 * ConfigModule과 같다. `.env.local`을 먼저 읽고, 이미 있는 값은 덮지 않는다.
 */
for (const file of ['.env.local', '.env']) {
  const envPath = resolve(process.cwd(), file);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}
