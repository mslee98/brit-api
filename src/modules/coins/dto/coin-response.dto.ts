import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CoinBalanceType } from '../domain/enums/coin-balance-type.enum';
import { CoinLedgerDirection } from '../domain/enums/coin-ledger-direction.enum';
import { CoinLedgerEntryType } from '../domain/enums/coin-ledger-entry-type.enum';
import { CoinLotStatus } from '../domain/enums/coin-lot-status.enum';
import { CoinPurchaseStatus } from '../domain/enums/coin-purchase-status.enum';
import { CoinSourceType } from '../domain/enums/coin-source-type.enum';
import { UserCoinLotEntity } from '../infrastructure/entities/user-coin-lot.entity';
import { UserCoinWalletEntity } from '../infrastructure/entities/user-coin-wallet.entity';
import { CoinLedgerEntryEntity } from '../infrastructure/entities/coin-ledger-entry.entity';
import { addAmount } from '../utils/coin-amount.util';

export class CoinWalletResponseDto {
  @ApiProperty({ example: '120000', description: '전체 잔액 (string bigint)' })
  totalBalance!: string;

  @ApiProperty({
    example: '120000',
    description: '사용 가능 잔액 = nonSellable + sellable',
  })
  availableBalance!: string;

  @ApiProperty({ example: '0', description: '잠금 잔액 합' })
  lockedBalance!: string;

  @ApiProperty({ example: '20000', description: '판매 가능 잔액 (string bigint)' })
  sellableBalance!: string;

  @ApiProperty({
    example: '100000',
    description: '판매 불가 잔액 (string bigint)',
  })
  nonSellableBalance!: string;

  @ApiProperty({ example: '0', description: '잠긴 판매 가능 잔액' })
  lockedSellableBalance!: string;

  @ApiProperty({ example: '0', description: '잠긴 판매 불가 잔액' })
  lockedNonSellableBalance!: string;

  @ApiProperty({ example: '0', description: 'REDEEM 확정 전 대기 잔액' })
  pendingSellableBalance!: string;

  static from(wallet: UserCoinWalletEntity): CoinWalletResponseDto {
    const available = addAmount(
      wallet.nonSellableBalance,
      wallet.sellableBalance,
    );
    const locked = addAmount(
      wallet.lockedNonSellableBalance,
      wallet.lockedSellableBalance,
    );
    const total = addAmount(available, locked);

    return {
      totalBalance: total,
      availableBalance: available,
      lockedBalance: locked,
      sellableBalance: wallet.sellableBalance,
      nonSellableBalance: wallet.nonSellableBalance,
      lockedSellableBalance: wallet.lockedSellableBalance,
      lockedNonSellableBalance: wallet.lockedNonSellableBalance,
      pendingSellableBalance: wallet.pendingSellableBalance,
    };
  }
}

export class CoinHistoryReferenceDto {
  @ApiProperty()
  type!: string;

  @ApiPropertyOptional({ nullable: true })
  id!: string | null;
}

export class CoinHistoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: CoinLedgerEntryType })
  type!: CoinLedgerEntryType;

  @ApiProperty({ example: '100000' })
  amount!: string;

  @ApiProperty({ enum: CoinBalanceType })
  balanceType!: CoinBalanceType;

  @ApiProperty({ enum: CoinLedgerDirection })
  direction!: CoinLedgerDirection;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: CoinHistoryReferenceDto })
  reference?: CoinHistoryReferenceDto;

  static from(entry: CoinLedgerEntryEntity): CoinHistoryItemDto {
    const nonSellable = BigInt(entry.nonSellableDelta);
    const sellable = BigInt(entry.sellableDelta);
    const useSellable = sellable !== 0n;
    const delta = useSellable ? sellable : nonSellable;
    const amount = delta < 0n ? (-delta).toString() : delta.toString();

    return {
      id: entry.id,
      type: entry.entryType,
      amount,
      balanceType: useSellable
        ? CoinBalanceType.SELLABLE
        : CoinBalanceType.NON_SELLABLE,
      direction: delta >= 0n ? CoinLedgerDirection.IN : CoinLedgerDirection.OUT,
      createdAt: entry.createdAt,
      reference: {
        type: entry.referenceType,
        id: entry.referenceId,
      },
    };
  }
}

export class CoinLotItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: CoinSourceType })
  sourceType!: CoinSourceType;

  @ApiProperty()
  originalAmount!: string;

  @ApiProperty()
  remainingAmount!: string;

  @ApiProperty()
  lockedAmount!: string;

  @ApiProperty()
  consumedAmount!: string;

  @ApiProperty()
  sellable!: boolean;

  @ApiProperty({ enum: CoinLotStatus })
  status!: CoinLotStatus;

  @ApiProperty()
  availableAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  static from(lot: UserCoinLotEntity): CoinLotItemDto {
    return {
      id: lot.id,
      sourceType: lot.sourceType,
      originalAmount: lot.originalAmount,
      remainingAmount: lot.remainingAmount,
      lockedAmount: lot.lockedAmount,
      consumedAmount: lot.consumedAmount,
      sellable: lot.isSellable,
      status: lot.status,
      availableAt: lot.availableAt,
      createdAt: lot.createdAt,
    };
  }
}

export class CoinPurchaseResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: CoinPurchaseStatus })
  status!: CoinPurchaseStatus;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
