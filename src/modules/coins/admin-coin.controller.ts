import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { CoinService } from './coin.service';
import {
  AdminCreditCoinDto,
  AdminDebitCoinDto,
  CreateCoinPurchaseDto,
} from './dto/admin-coin-command.dto';
import {
  CoinLotItemDto,
  CoinPurchaseResponseDto,
  CoinWalletResponseDto,
} from './dto/coin-response.dto';
import { SearchCoinHistoryDto, SearchCoinLotsDto } from './dto/search-coin.dto';
import { CoinDomainException } from './exceptions/coin.exceptions';

/**
 * 관리자 사용자별 Coin 조회·보정·구매 생성.
 * 경로 prefix는 admin/users (AdminUserController와 동일).
 */
@ApiTags('admin-coins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/users')
export class AdminCoinController {
  constructor(private readonly coinService: CoinService) {}

  @Get(':userId/coins/wallet')
  @ApiOperation({ summary: '관리자 사용자 Coin 지갑 조회' })
  @ApiOkResponse({ type: CoinWalletResponseDto })
  getWallet(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<CoinWalletResponseDto> {
    return this.coinService.getWallet(userId);
  }

  @Get(':userId/coins/history')
  @ApiOperation({ summary: '관리자 사용자 Coin 원장' })
  getHistory(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: SearchCoinHistoryDto,
  ) {
    return this.coinService.getHistory(userId, query);
  }

  @Get(':userId/coins/lots')
  @ApiOperation({ summary: '관리자 사용자 Coin Lot 목록' })
  getLots(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: SearchCoinLotsDto,
  ) {
    return this.coinService.getLots(userId, query);
  }

  @Get(':userId/coins/lots/:lotId')
  @ApiOperation({ summary: '관리자 사용자 Coin Lot 상세' })
  @ApiOkResponse({ type: CoinLotItemDto })
  getLotDetail(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
  ): Promise<CoinLotItemDto> {
    return this.coinService.getLotDetail(userId, lotId);
  }

  @Post(':userId/coins/credit')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '관리자 Coin 지급 (sellable=true는 SYS_ADMIN만)' })
  @ApiOkResponse({ type: CoinWalletResponseDto })
  credit(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: AdminCreditCoinDto,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CoinWalletResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw CoinDomainException.idempotencyKeyRequired();
    }
    return this.coinService.adminCredit(
      admin.userId,
      admin.role,
      userId,
      body,
      resolveClientIp(req),
      idempotencyKey,
    );
  }

  @Post(':userId/coins/debit')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '관리자 Coin 차감 (FIFO Lot 소비)' })
  @ApiOkResponse({ type: CoinWalletResponseDto })
  debit(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: AdminDebitCoinDto,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CoinWalletResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw CoinDomainException.idempotencyKeyRequired();
    }
    return this.coinService.adminDebit(
      admin.userId,
      userId,
      body,
      resolveClientIp(req),
      idempotencyKey,
    );
  }

  @Post(':userId/coin-purchases')
  @HttpCode(201)
  @ApiOperation({ summary: 'Brit Coin 구매 PENDING 생성 (P0 운영/테스트용)' })
  @ApiCreatedResponse({ type: CoinPurchaseResponseDto })
  createPurchase(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateCoinPurchaseDto,
  ): Promise<CoinPurchaseResponseDto> {
    return this.coinService.createCoinPurchase(
      admin.userId,
      userId,
      body.amount,
    );
  }
}
