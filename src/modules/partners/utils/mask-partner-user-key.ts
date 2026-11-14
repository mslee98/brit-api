/** 업체 회원 키 마스킹 (동의·목록 표시용). */
export function maskPartnerUserKey(key: string): string {
  if (key.length <= 2) return `${key[0] ?? ''}*`;
  if (key.length <= 4) {
    return `${key.slice(0, 1)}${'*'.repeat(key.length - 2)}${key.slice(-1)}`;
  }
  return `${key.slice(0, 2)}${'*'.repeat(Math.min(key.length - 3, 6))}${key.slice(-1)}`;
}
