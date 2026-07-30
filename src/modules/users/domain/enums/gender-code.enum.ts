/**
 * 성별 코드. DB에는 char(1) 'M'|'F'로 저장.
 * RRN 7번째 자리에서 서버가 파생한다 (`users/utils/rrn.util`).
 */
export enum GenderCode {
  MALE = 'M',
  FEMALE = 'F',
}
