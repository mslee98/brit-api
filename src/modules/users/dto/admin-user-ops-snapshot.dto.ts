import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UserBankAccountStatus } from '../domain/enums/user-bank-account-status.enum';

/** 관리자 화면용 지갑 표시 상태 (원장 coin_wallet_status와 1:N 매핑) */
export enum AdminWalletStatusView {
  NORMAL = 'NORMAL',
  LOCKED = 'LOCKED',
  RESTRICTED = 'RESTRICTED',
}

export class AdminUserRecentActivityDto {
  @ApiProperty({ example: '2026-08-18T10:00:00.000Z' })
  at!: Date;

  @ApiProperty({ example: 'login' })
  type!: string;

  @ApiProperty({ example: '로그인' })
  label!: string;

  @ApiPropertyOptional()
  amount?: number;
}

export class AdminUserOpsSnapshotDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: UserBankAccountStatus })
  bankStatus!: UserBankAccountStatus;

  @ApiProperty({ enum: AdminWalletStatusView })
  walletStatus!: AdminWalletStatusView;

  @ApiProperty({ example: '120000', description: '전체 잔액 (string bigint)' })
  totalCoin!: string;

  @ApiProperty({ example: '120000', description: '사용 가능 잔액' })
  availableCoin!: string;

  @ApiProperty({ example: '20000', description: '판매 가능 잔액' })
  sellableCoin!: string;

  @ApiProperty({ example: '0', description: '잠금 잔액' })
  lockedCoin!: string;

  @ApiProperty({ example: 1 })
  ongoingTrades!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: '50000',
    description: '진행 거래 결제 합 (string bigint, 없으면 null)',
  })
  ongoingTradeAmount!: string | null;

  @ApiProperty({ example: 12 })
  lifetimeTrades!: number;

  @ApiProperty({ example: 10 })
  completedTrades!: number;

  @ApiProperty({ example: 0 })
  ongoingDisputes!: number;

  @ApiProperty({ example: 1 })
  lifetimeDisputes!: number;

  @ApiProperty({ example: 2 })
  activeSessions!: number;

  @ApiProperty()
  needsPinUnlock!: boolean;

  @ApiPropertyOptional({ nullable: true })
  bankName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  accountNumberMasked!: string | null;

  @ApiProperty({ type: [AdminUserRecentActivityDto] })
  recentActivities!: AdminUserRecentActivityDto[];
}
