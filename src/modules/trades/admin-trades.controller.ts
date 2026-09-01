import {
  Body,
  Controller,
  Get,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AdminAccessService } from '../admins/admin-access.service';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import {
  AdminOpenDisputeDto,
  AdminTradeReasonDto,
} from './dto/admin-trade-command.dto';
import {
  AdminTradeCoinLotDto,
  AdminTradeDetailDto,
  AdminTradeEventDto,
} from './dto/admin-trade-response.dto';
import {
  SearchAdminTradeTimeoutsDto,
  SearchAdminTradesDto,
} from './dto/search-trades.dto';
import { TradeService } from './trade.service';

@ApiTags('admin-trades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/trades')
export class AdminTradesController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly adminAccessService: AdminAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: '관리자 거래 목록' })
  list(@Query() query: SearchAdminTradesDto) {
    return this.tradeService.listAdminTrades(query);
  }

  @Get('timeouts')
  @ApiOperation({ summary: '시간 초과 거래 목록' })
  listTimeouts(@Query() query: SearchAdminTradeTimeoutsDto) {
    return this.tradeService.listAdminTradeTimeouts(query);
  }

  @Get(':tradeId/events')
  @ApiOperation({ summary: '거래 이벤트 조회' })
  @ApiOkResponse({ type: [AdminTradeEventDto] })
  listEvents(
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<AdminTradeEventDto[]> {
    return this.tradeService.getAdminTradeEvents(tradeId);
  }

  @Get(':tradeId/coin-lots')
  @ApiOperation({ summary: '거래 Coin Lot 배정 조회 (리더/SYS_ADMIN)' })
  @ApiOkResponse({ type: [AdminTradeCoinLotDto] })
  async listCoinLots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<AdminTradeCoinLotDto[]> {
    await this.adminAccessService.assertIsLeaderOrSysAdmin(user);
    return this.tradeService.getAdminTradeCoinLots(tradeId);
  }

  @Get(':tradeId')
  @ApiOperation({ summary: '관리자 거래 상세' })
  @ApiOkResponse({ type: AdminTradeDetailDto })
  getOne(
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ): Promise<AdminTradeDetailDto> {
    return this.tradeService.getAdminTrade(tradeId);
  }

  @Post(':tradeId/confirm-late-payment')
  @HttpCode(200)
  @ApiOperation({ summary: 'PAYMENT_TIMEOUT → 판매자 확인 대기 (늦은 입금 확인)' })
  @ApiOkResponse({ type: AdminTradeDetailDto })
  async confirmLatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
    @Body() dto: AdminTradeReasonDto,
    @Req() req: Request,
  ): Promise<AdminTradeDetailDto> {
    await this.adminAccessService.assertIsLeaderOrSysAdmin(user);
    return this.tradeService.confirmLatePayment(
      user.userId,
      tradeId,
      dto,
      resolveClientIp(req),
    );
  }

  @Post(':tradeId/confirm-non-payment')
  @HttpCode(200)
  @ApiOperation({ summary: 'PAYMENT_TIMEOUT 미입금 확정·취소' })
  @ApiOkResponse({ type: AdminTradeDetailDto })
  async confirmNonPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
    @Body() dto: AdminTradeReasonDto,
    @Req() req: Request,
  ): Promise<AdminTradeDetailDto> {
    await this.adminAccessService.assertIsLeaderOrSysAdmin(user);
    return this.tradeService.confirmNonPayment(
      user.userId,
      tradeId,
      dto,
      resolveClientIp(req),
    );
  }

  @Post(':tradeId/open-dispute')
  @HttpCode(200)
  @ApiOperation({ summary: '분쟁 접수' })
  @ApiOkResponse({ type: AdminTradeDetailDto })
  openDispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
    @Body() dto: AdminOpenDisputeDto,
    @Req() req: Request,
  ): Promise<AdminTradeDetailDto> {
    return this.tradeService.openDispute(
      user.userId,
      tradeId,
      dto,
      resolveClientIp(req),
    );
  }
}
