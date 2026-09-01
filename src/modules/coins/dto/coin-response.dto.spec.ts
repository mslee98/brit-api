import { CoinWalletStatus } from '../domain/enums/coin-wallet-status.enum';
import { UserCoinWalletEntity } from '../infrastructure/entities/user-coin-wallet.entity';
import { CoinWalletResponseDto } from './coin-response.dto';

describe('CoinWalletResponseDto', () => {
  it('computes total/available/locked from wallet balances', () => {
    const wallet = {
      nonSellableBalance: '100000',
      sellableBalance: '20000',
      lockedNonSellableBalance: '0',
      lockedSellableBalance: '5000',
      pendingSellableBalance: '0',
      status: CoinWalletStatus.ACTIVE,
    } as UserCoinWalletEntity;

    const dto = CoinWalletResponseDto.from(wallet);
    expect(dto.availableBalance).toBe('120000');
    expect(dto.lockedBalance).toBe('5000');
    expect(dto.totalBalance).toBe('125000');
    expect(dto.pendingSellableBalance).toBe('0');
  });
});
