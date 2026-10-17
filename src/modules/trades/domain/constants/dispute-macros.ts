export type DisputeMacroSeed = {
  id: string;
  title: string;
  body: string;
  isInternal: boolean;
};

/** CS Inbox 매크로 정적 시드. DB 없이 제공. */
export const DISPUTE_MACROS: DisputeMacroSeed[] = [
  {
    id: 'greet',
    title: '인사·합류',
    body: '안녕하세요. Brit 분쟁조정팀입니다. 확인을 도와드릴게요.',
    isInternal: false,
  },
  {
    id: 'ask-evidence-buyer',
    title: '구매자 증빙 요청',
    body: '입금 내역 스크린샷(금액·계좌·시각이 보이게)을 채팅에 첨부해 주세요.',
    isInternal: false,
  },
  {
    id: 'ask-evidence-seller',
    title: '판매자 증빙 요청',
    body: '계좌 입금 내역을 확인하신 뒤, 관련 화면을 첨부해 주시면 검토가 빨라져요.',
    isInternal: false,
  },
  {
    id: 'wait-confirm',
    title: '확인 대기 안내',
    body: '양측 답변을 확인한 뒤 이어서 안내드릴게요. 조금만 기다려 주세요.',
    isInternal: false,
  },
  {
    id: 'closing-complete',
    title: '종결(강제완료 안내)',
    body: '검토 결과 입금이 확인되어 거래를 완료 처리합니다. 코인이 지급돼요.',
    isInternal: false,
  },
  {
    id: 'closing-cancel',
    title: '종결(강제취소 안내)',
    body: '검토 결과 입금이 확인되지 않아 거래를 취소 처리합니다.',
    isInternal: false,
  },
  {
    id: 'internal-suspect-false',
    title: '내부·허위 신고 의심',
    body: '입금 증빙 불일치. 허위 신고 가능성 — 추가 확인 필요.',
    isInternal: true,
  },
  {
    id: 'internal-handoff',
    title: '내부·인수인계',
    body: '현재까지 확인: 양측 메시지 확인함. 증빙 대기 중.',
    isInternal: true,
  },
];
