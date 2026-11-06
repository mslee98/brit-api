import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';

import { RealtimeSessionRegistry } from '../../../common/realtime/realtime-session.registry';
import {
  applySocketAuth,
  getSocketUser,
} from '../../../common/realtime/socket-auth';
import { AccessTokenVerifier } from '../../auth/access-token.verifier';
import { BuyOrderEntity } from '../infrastructure/entities/buy-order.entity';
import {
  buyOrderRoom,
  ORDER_WS_EVENTS,
  ORDER_WS_NAMESPACE,
  orderUserRoom,
} from './order-realtime.constants';
import { OrderRealtimePublisher } from './order-realtime.publisher';

function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  const value =
    raw || 'http://localhost:5173,http://localhost:5174,http://localhost:5175';
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

type BuyOrderRoomBody = { buyOrderId?: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  namespace: ORDER_WS_NAMESPACE,
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  },
})
export class OrderGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(OrderGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @InjectRepository(BuyOrderEntity)
    private readonly buyOrderRepository: Repository<BuyOrderEntity>,
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly publisher: OrderRealtimePublisher,
    private readonly configService: ConfigService,
    private readonly sessions: RealtimeSessionRegistry,
  ) {}

  afterInit(server: Server): void {
    applySocketAuth(server, this.accessTokenVerifier, this.logger);
    this.publisher.attach(server);
    this.logger.log(
      `Order WS ready ns=${ORDER_WS_NAMESPACE} cors=${this.configService.get<string>('CORS_ORIGINS') ?? 'default'}`,
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = getSocketUser(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    this.sessions.track(client);
    // 상태 복구로 붙은 연결은 room이 이미 복원돼 있다.
    if (!client.recovered) {
      await client.join(orderUserRoom(user.userId));
    }
  }

  handleDisconnect(client: Socket): void {
    this.sessions.untrack(client);
    this.logger.debug(`Order WS disconnect id=${client.id}`);
  }

  @SubscribeMessage(ORDER_WS_EVENTS.JOIN_BUY_ORDER)
  async onJoinBuyOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BuyOrderRoomBody,
  ): Promise<{ ok: true }> {
    const user = getSocketUser(client);
    if (!user) {
      throw new WsException('UNAUTHORIZED');
    }
    const buyOrderId = body?.buyOrderId?.trim();
    if (!buyOrderId || !UUID_PATTERN.test(buyOrderId)) {
      throw new WsException('BUY_ORDER_REQUIRED');
    }
    const owned = await this.buyOrderRepository.exists({
      where: { id: buyOrderId, buyerUserId: user.userId },
    });
    if (!owned) {
      throw new WsException('BUY_ORDER_NOT_FOUND');
    }
    await client.join(buyOrderRoom(buyOrderId));
    return { ok: true };
  }

  @SubscribeMessage(ORDER_WS_EVENTS.LEAVE_BUY_ORDER)
  async onLeaveBuyOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BuyOrderRoomBody,
  ): Promise<{ ok: true }> {
    const buyOrderId = body?.buyOrderId?.trim();
    if (buyOrderId) {
      await client.leave(buyOrderRoom(buyOrderId));
    }
    return { ok: true };
  }
}
