/**
 * 가입 시 동의 문서 종류.
 * user_consents.consent_type에 varchar로 저장 (CHECK로 값 제한).
 *
 * 가입 필수: SERVICE, PRIVACY, UNIQUE_IDENTIFIER, BANK_ACCOUNT
 * 선택: MARKETING
 */
export enum ConsentType {
  SERVICE = 'SERVICE',
  PRIVACY = 'PRIVACY',
  UNIQUE_IDENTIFIER = 'UNIQUE_IDENTIFIER',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
  MARKETING = 'MARKETING',
}
