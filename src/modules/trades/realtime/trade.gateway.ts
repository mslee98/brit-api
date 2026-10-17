import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { AccessTokenVerifier } from '../../auth/access-token.verifier';
import { TradeRealtimePublisher } from './trade-realtime.publisher';
import { TRADE_WS_NAMESPACE, tradeUserRoom } from './trade-realtime.constants';

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

@WebSocketGateway({
  namespace: TRADE_WS_NAMESPACE,
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  },
})
export class TradeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TradeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly publisher: TradeRealtimePublisher,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.publisher.attach(server);
    this.logger.log(
      `Trade WS ready ns=${TRADE_WS_NAMESPACE} cors=${this.configService.get<string>('CORS_ORIGINS') ?? 'default'}`,
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
      await client.join(tradeUserRoom(user.userId));
    } catch (error) {
      this.logger.warn(
        `Trade WS connect rejected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Trade WS disconnect id=${client.id}`);
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
