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
import type { Server, Socket } from 'socket.io';

import { AccessTokenVerifier } from '../../auth/access-token.verifier';
import {
  buyOrderRoom,
  ORDER_WS_EVENTS,
  ORDER_WS_NAMESPACE,
  orderUserRoom,
} from './order-realtime.constants';
import { OrderRealtimePublisher } from './order-realtime.publisher';

function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  const value =
    raw ||
    'http://localhost:5173,http://localhost:5174,http://localhost:5175';
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

type BuyOrderRoomBody = { buyOrderId?: string };

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
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly publisher: OrderRealtimePublisher,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.publisher.attach(server);
    this.logger.log(
      `Order WS ready ns=${ORDER_WS_NAMESPACE} cors=${this.configService.get<string>('CORS_ORIGINS') ?? 'default'}`,
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new WsException('UNAUTHORIZED');
      }
      const user = await this.accessTokenVerifier.verify(token);
      client.data.user = user;
      await client.join(orderUserRoom(user.userId));
    } catch (error) {
      this.logger.warn(
        `Order WS connect rejected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Order WS disconnect id=${client.id}`);
  }

  @SubscribeMessage(ORDER_WS_EVENTS.JOIN_BUY_ORDER)
  async onJoinBuyOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BuyOrderRoomBody,
  ): Promise<{ ok: true }> {
    if (!client.data.user) {
      throw new WsException('UNAUTHORIZED');
    }
    const buyOrderId = body?.buyOrderId?.trim();
    if (!buyOrderId) {
      throw new WsException('BUY_ORDER_REQUIRED');
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

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.trim()) {
      return auth.token.trim();
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    return null;
  }
}
