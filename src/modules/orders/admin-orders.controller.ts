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

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AdminOrderService } from './admin-order.service';
import {
  AdminBuyOrderDetailDto,
  AdminBuyOrderListItemDto,
  AdminSellOrderCoinLotItemDto,
  AdminSellOrderDetailDto,
  AdminSellOrderListItemDto,
  SearchAdminBuyOrdersDto,
  SearchAdminSellOrdersDto,
} from './dto/admin-order-list-response.dto';
import { SearchAdminOrdersDto } from './dto/search-orders.dto';

@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin')
export class AdminOrdersController {
  constructor(private readonly adminOrderService: AdminOrderService) {}

  @Get('orders')
  @ApiOperation({ summary: '관리자 구매/판매 주문 통합 목록 (legacy)' })
  list(@Query() query: SearchAdminOrdersDto) {
    return this.adminOrderService.listOrders(query);
  }

  @Get('buy-orders')
  @ApiOperation({ summary: '관리자 구매 주문 목록' })
  listBuyOrders(@Query() query: SearchAdminBuyOrdersDto) {
    return this.adminOrderService.listBuyOrders(query);
  }

  @Get('buy-orders/:orderId')
  @ApiOperation({ summary: '관리자 구매 주문 상세' })
  @ApiOkResponse({ type: AdminBuyOrderDetailDto })
  getBuyOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<AdminBuyOrderDetailDto> {
    return this.adminOrderService.getBuyOrder(orderId);
  }

  @Get('sell-orders')
  @ApiOperation({ summary: '관리자 판매 주문 목록' })
  listSellOrders(@Query() query: SearchAdminSellOrdersDto) {
    return this.adminOrderService.listSellOrders(query);
  }

  @Get('sell-orders/:orderId/coin-lots')
  @ApiOperation({ summary: '판매 주문 잠금 Coin Lot' })
  @ApiOkResponse({ type: [AdminSellOrderCoinLotItemDto] })
  getSellOrderCoinLots(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<AdminSellOrderCoinLotItemDto[]> {
    return this.adminOrderService.getSellOrderCoinLots(orderId);
  }

  @Get('sell-orders/:orderId')
  @ApiOperation({ summary: '관리자 판매 주문 상세' })
  @ApiOkResponse({ type: AdminSellOrderDetailDto })
  getSellOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<AdminSellOrderDetailDto> {
    return this.adminOrderService.getSellOrder(orderId);
  }
}
