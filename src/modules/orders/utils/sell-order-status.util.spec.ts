import { SellOrderStatus } from '../domain/enums/sell-order-status.enum';
import { deriveSellOrderStatus } from './sell-order-status.util';

describe('deriveSellOrderStatus', () => {
  it('OPEN when remaining > 0 and reserved = 0', () => {
    expect(deriveSellOrderStatus(100n, 0n)).toBe(SellOrderStatus.OPEN);
  });

  it('PARTIALLY_MATCHED when remaining and reserved > 0', () => {
    expect(deriveSellOrderStatus(300n, 200n)).toBe(
      SellOrderStatus.PARTIALLY_MATCHED,
    );
  });

  it('FULLY_RESERVED when remaining = 0 and reserved > 0', () => {
    expect(deriveSellOrderStatus(0n, 200n)).toBe(SellOrderStatus.FULLY_RESERVED);
  });

  it('COMPLETED when remaining = 0 and reserved = 0', () => {
    expect(deriveSellOrderStatus(0n, 0n)).toBe(SellOrderStatus.COMPLETED);
  });
});
