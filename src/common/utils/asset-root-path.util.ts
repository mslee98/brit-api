import { isAbsolute, join, resolve } from 'path';

/**
 * 공유 정적 자산 루트 (`brit/bucket`).
 * ASSET_ROOT_PATH가 상대경로면 process.cwd() 기준 (로컬 기본: ../bucket).
 */
export function resolveAssetRootPath(assetRootPath?: string): string {
  const raw = assetRootPath?.trim() || join('..', 'bucket');
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}
