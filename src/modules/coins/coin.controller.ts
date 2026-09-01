import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CoinService } from './coin.service';
import {
  CoinLotItemDto,
  CoinWalletResponseDto,
} from './dto/coin-response.dto';
import { SearchCoinHistoryDto, SearchCoinLotsDto } from './dto/search-coin.dto';

/**
 * 로그인 사용자 Coin 조회 API.
 * Write(구매·보정)는 관리자/내부 경로만 사용한다.
 */
@ApiTags('coins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coins')
export class CoinController {
  constructor(private readonly coinService: CoinService) {}

  @Get('wallet')
  @ApiOperation({ summary: '내 Coin 지갑 요약' })
  @ApiOkResponse({ type: CoinWalletResponseDto })
  getWallet(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CoinWalletResponseDto> {
    return this.coinService.getWallet(user.userId);
  }

  @Get('history')
  @ApiOperation({ summary: '내 Coin 증감 이력' })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchCoinHistoryDto,
  ) {
    return this.coinService.getHistory(user.userId, query);
  }

  @Get('lots')
  @ApiOperation({ summary: '내 Coin Lot 목록' })
  getLots(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchCoinLotsDto,
  ) {
    return this.coinService.getLots(user.userId, query);
  }

  @Get('lots/:lotId')
  @ApiOperation({ summary: '내 Coin Lot 상세' })
  @ApiOkResponse({ type: CoinLotItemDto })
  getLotDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lotId', ParseUUIDPipe) lotId: string,
  ): Promise<CoinLotItemDto> {
    return this.coinService.getLotDetail(user.userId, lotId);
  }
}
