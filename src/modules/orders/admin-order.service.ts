import { Injectable } from '@nestjs/common';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { BuyOrderService } from './buy-order.service';
import {
  AdminBuyOrderDetailDto,
  AdminBuyOrderListItemDto,
  AdminSellOrderCoinLotItemDto,
  AdminSellOrderDetailDto,
  AdminSellOrderListItemDto,
  SearchAdminBuyOrdersDto,
  SearchAdminSellOrdersDto,
} from './dto/admin-order-list-response.dto';
import {
  AdminOrderListItemDto,
  AdminOrderSide,
  SearchAdminOrdersDto,
} from './dto/search-orders.dto';
import { SellOrderService } from './sell-order.service';

/** 관리자 주문 목록·상세 위임 */
@Injectable()
export class AdminOrderService {
  constructor(
    private readonly buyOrderService: BuyOrderService,
    private readonly sellOrderService: SellOrderService,
  ) {}

  listBuyOrders(
    query: SearchAdminBuyOrdersDto,
  ): Promise<{ items: AdminBuyOrderListItemDto[]; pagination: PaginationMeta }> {
    return this.buyOrderService.searchAdminBuyOrders(query);
  }

  listSellOrders(
    query: SearchAdminSellOrdersDto,
  ): Promise<{ items: AdminSellOrderListItemDto[]; pagination: PaginationMeta }> {
    return this.sellOrderService.searchAdminSellOrders(query);
  }

  async listOrders(
    query: SearchAdminOrdersDto,
  ): Promise<{ items: AdminOrderListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;

    if (query.side === AdminOrderSide.BUY) {
      const result = await this.buyOrderService.searchAdminBuyOrders({
        page,
        size,
      });
      return {
        items: result.items.map((item) => ({
          side: AdminOrderSide.BUY,
          id: item.id,
          orderNumber: item.orderNumber,
          userId: item.buyer.userId,
          coinAmount: item.coinAmount,
          status: item.status,
          createdAt: item.createdAt,
        })),
        pagination: result.pagination,
      };
    }

    if (query.side === AdminOrderSide.SELL) {
      const result = await this.sellOrderService.searchAdminSellOrders({
        page,
        size,
      });
      return {
        items: result.items.map((item) => ({
          side: AdminOrderSide.SELL,
          id: item.id,
          orderNumber: item.orderNumber,
          userId: item.seller.userId,
          coinAmount: item.originalCoinAmount,
          status: item.status,
          createdAt: item.createdAt,
        })),
        pagination: result.pagination,
      };
    }

    const fetchSize = page * size;
    const [buys, sells] = await Promise.all([
      this.buyOrderService.searchAdminBuyOrders({ page: 1, size: fetchSize }),
      this.sellOrderService.searchAdminSellOrders({ page: 1, size: fetchSize }),
    ]);

    const merged: AdminOrderListItemDto[] = [
      ...buys.items.map((item) => ({
        side: AdminOrderSide.BUY,
        id: item.id,
        orderNumber: item.orderNumber,
        userId: item.buyer.userId,
        coinAmount: item.coinAmount,
        status: item.status,
        createdAt: item.createdAt,
      })),
      ...sells.items.map((item) => ({
        side: AdminOrderSide.SELL,
        id: item.id,
        orderNumber: item.orderNumber,
        userId: item.seller.userId,
        coinAmount: item.originalCoinAmount,
        status: item.status,
        createdAt: item.createdAt,
      })),
    ];

    merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const totalItems = buys.pagination.totalItems + sells.pagination.totalItems;
    const start = (page - 1) * size;

    return {
      items: merged.slice(start, start + size),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  getBuyOrder(orderId: string): Promise<AdminBuyOrderDetailDto> {
    return this.buyOrderService.getAdminBuyOrder(orderId);
  }

  getSellOrder(orderId: string): Promise<AdminSellOrderDetailDto> {
    return this.sellOrderService.getAdminSellOrder(orderId);
  }

  getSellOrderCoinLots(
    orderId: string,
  ): Promise<AdminSellOrderCoinLotItemDto[]> {
    return this.sellOrderService.getAdminSellOrderCoinLots(orderId);
  }
}
