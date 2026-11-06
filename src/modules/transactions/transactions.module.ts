import { Module } from '@nestjs/common';

import { AuthGuardsModule } from '../auth/auth-guards.module';
import { TransactionHistoryService } from './transaction-history.service';
import { TransactionsController } from './transactions.controller';

/**
 * 사용자 통합 거래내역 조회 전용 모듈. Read-only.
 * 원본 테이블을 SQL로 직접 읽고 Trades·Coins·Partners 모듈은 import하지 않는다.
 */
@Module({
  imports: [AuthGuardsModule],
  controllers: [TransactionsController],
  providers: [TransactionHistoryService],
})
export class TransactionsModule {}
