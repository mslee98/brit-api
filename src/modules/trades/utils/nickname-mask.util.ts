/** 상대 닉네임 마스킹. 예: 이민성 → 이** */
export function maskNickname(nickname: string | null): string {
  if (!nickname || nickname.length === 0) {
    return '***';
  }
  return `${nickname.charAt(0)}**`;
}
