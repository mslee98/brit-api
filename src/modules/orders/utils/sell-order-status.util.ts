import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';

/**
 * remaining/reserved로 판매 주문 상태를 계산한다.
 * remaining=0 && reserved=0 은 전량 완료로 본다 (cancelled는 호출하지 않음).
 */
export function deriveSellOrderStatus(
  remaining: bigint,
  reserved: bigint,
): SellOrderStatus {
  if (remaining === 0n && reserved === 0n) {
    return SellOrderStatus.COMPLETED;
  }
  if (remaining > 0n && reserved === 0n) {
    return SellOrderStatus.OPEN;
  }
  if (remaining > 0n && reserved > 0n) {
    return SellOrderStatus.PARTIALLY_MATCHED;
  }
  return SellOrderStatus.FULLY_RESERVED;
}
