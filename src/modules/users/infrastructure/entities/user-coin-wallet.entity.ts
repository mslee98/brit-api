import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { CoinWalletStatus } from '../../domain/enums/coin-wallet-status.enum';
import { UserEntity } from './user.entity';

/**
 * user_coin_wallets — 사용자별 Coin 잔액 집계 (users 1:1).
 *
 * 잔액 변화의 최종 근거는 후속 coin_ledger_entries다. 이 테이블은 조회용 스냅샷.
 * 가입 트랜잭션에서 0잔액 ACTIVE로 함께 생성한다.
 *
 * 잔액 구분:
 * - non_sellable: 업체 충전 가능, P2P 판매 불가
 * - sellable: P2P·충전 가능
 * - locked_*: 처리 중 잠금
 * - pending_sellable: REDEEM 확정 전 대기
 *
 * version: 낙관적 잠금 (@VersionColumn)
 * bigint 잔액은 TS에서 string으로 다룬다.
 */
@Entity({ name: 'user_coin_wallets' })
@Check('ck_user_coin_wallets_non_sellable', '"non_sellable_balance" >= 0')
@Check('ck_user_coin_wallets_sellable', '"sellable_balance" >= 0')
@Check(
  'ck_user_coin_wallets_locked_non_sellable',
  '"locked_non_sellable_balance" >= 0',
)
@Check(
  'ck_user_coin_wallets_locked_sellable',
  '"locked_sellable_balance" >= 0',
)
@Check(
  'ck_user_coin_wallets_pending_sellable',
  '"pending_sellable_balance" >= 0',
)
@Check('ck_user_coin_wallets_version', '"version" >= 0')
export class UserCoinWalletEntity {
  @PrimaryColumn({
    type: 'uuid',
    name: 'user_id',
  })
  userId!: string;

  @OneToOne(() => UserEntity, (user) => user.coinWallet, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
  })
  user!: UserEntity;

  @Column({
    type: 'bigint',
    name: 'non_sellable_balance',
    default: 0,
  })
  nonSellableBalance!: string;

  @Column({
    type: 'bigint',
    name: 'sellable_balance',
    default: 0,
  })
  sellableBalance!: string;

  @Column({
    type: 'bigint',
    name: 'locked_non_sellable_balance',
    default: 0,
  })
  lockedNonSellableBalance!: string;

  @Column({
    type: 'bigint',
    name: 'locked_sellable_balance',
    default: 0,
  })
  lockedSellableBalance!: string;

  @Column({
    type: 'bigint',
    name: 'pending_sellable_balance',
    default: 0,
  })
  pendingSellableBalance!: string;

  @Column({
    type: 'enum',
    enum: CoinWalletStatus,
    enumName: 'coin_wallet_status',
    name: 'status',
    default: CoinWalletStatus.ACTIVE,
  })
  status!: CoinWalletStatus;

  @VersionColumn({
    type: 'bigint',
    name: 'version',
    default: 0,
  })
  version!: number;

  @Column({
    type: 'timestamptz',
    name: 'suspended_at',
    nullable: true,
  })
  suspendedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'suspended_reason',
    nullable: true,
  })
  suspendedReason!: string | null;

  @Column({
    type: 'timestamptz',
    name: 'closed_at',
    nullable: true,
  })
  closedAt!: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    name: 'updated_at',
  })
  updatedAt!: Date;
}
