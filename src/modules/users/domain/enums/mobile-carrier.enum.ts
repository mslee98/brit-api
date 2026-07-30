/**
 * 가입 시 사용자가 선택한 통신사.
 * DB는 varchar(20). 외부 본인인증 결과가 아니라 제출 값이다.
 */
export enum MobileCarrier {
  SKT = 'SKT',
  KT = 'KT',
  LGU = 'LGU',

  SKT_MVNO = 'SKT_MVNO',
  KT_MVNO = 'KT_MVNO',
  LGU_MVNO = 'LGU_MVNO',
}
