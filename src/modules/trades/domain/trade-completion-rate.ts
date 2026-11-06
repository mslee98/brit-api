import { TradeEventActorType } from './enums/trade-event-actor-type.enum';
import { TradeEventCode } from './enums/trade-event-code.enum';
import { TradeStatus } from './enums/trade-status.enum';

export type TradeParty = 'BUYER' | 'SELLER';

/**
 * 당사자 귀책 취소 판정 (TRADE_CANCELLED 이벤트의 actor·previous_status 기준).
 * - BUYER: 입금 전 구매자 취소, 입금 시한 초과 후 미입금 확정
 * - SELLER: 입금 전 판매자 취소
 * 합의 취소·분쟁 강제 취소 등은 어느 쪽 귀책에도 넣지 않는다.
 */
const FAULT_CONDITION: Record<TradeParty, string> = {
  BUYER: `(fault_e.actor_type = '${TradeEventActorType.BUYER}'
      AND fault_e.previous_status = '${TradeStatus.WAITING_BUYER_PAYMENT}')
    OR fault_e.previous_status = '${TradeStatus.PAYMENT_TIMEOUT}'`,
  SELLER: `fault_e.actor_type = '${TradeEventActorType.SELLER}'
    AND fault_e.previous_status = '${TradeStatus.WAITING_BUYER_PAYMENT}'`,
};

/**
 * `COUNT(*) FILTER (WHERE …)` 안에 넣는 귀책 취소 조건.
 * 값은 enum 상수만 인라인하므로 사용자 입력이 섞이지 않는다.
 */
export function faultCancelledTradeSql(
  tradeAlias: string,
  party: TradeParty,
): string {
  return `${tradeAlias}.status = '${TradeStatus.CANCELLED}' AND EXISTS (
    SELECT 1 FROM trade_events fault_e
    WHERE fault_e.trade_id = ${tradeAlias}.id
      AND fault_e.event_code = '${TradeEventCode.TRADE_CANCELLED}'
      AND (${FAULT_CONDITION[party]})
  )`;
}

/** completed ÷ (completed + 귀책 취소) — 분모 0이면 null (0건 + 100% 금지) */
export function computeCompletionRatePct(
  completedCount: number,
  faultCancelCount: number,
): number | null {
  const base = completedCount + faultCancelCount;
  return base === 0 ? null : Math.floor((completedCount / base) * 100);
}
