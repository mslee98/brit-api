import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SearchTransactionDto,
  TransactionSummaryQueryDto,
} from './dto/search-transaction.dto';
import {
  TransactionDetailDto,
  TransactionListResponseDto,
  TransactionSummaryResponseDto,
} from './dto/transaction-response.dto';
import { TransactionHistoryService } from './transaction-history.service';

@ApiTags('me-transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/transactions')
export class TransactionsController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '내 통합 거래내역',
    description:
      'P2P 구매·판매, Brit 구매, 업체 충전·환전, Coin 조정을 끝난 시각(진행 중이면 시작 시각) 최신순으로 반환합니다.',
  })
  @ApiOkResponse({ type: TransactionListResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchTransactionDto,
  ): Promise<TransactionListResponseDto> {
    return this.transactionHistoryService.list(user.userId, query);
  }

  @Get('summary')
  @ApiOperation({
    summary: '월간 Coin 변화 요약',
    description: '완료 건 기준 들어옴·나감·순변화와 날짜별·종류별 합계',
  })
  @ApiOkResponse({ type: TransactionSummaryResponseDto })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TransactionSummaryQueryDto,
  ): Promise<TransactionSummaryResponseDto> {
    return this.transactionHistoryService.summary(user.userId, query);
  }

  @Get(':transactionId')
  @ApiOperation({ summary: '거래내역 상세' })
  @ApiOkResponse({ type: TransactionDetailDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
  ): Promise<TransactionDetailDto> {
    return this.transactionHistoryService.detail(user.userId, transactionId);
  }
}
