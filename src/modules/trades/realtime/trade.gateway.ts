import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { RealtimeSessionRegistry } from '../../../common/realtime/realtime-session.registry';
import {
  applySocketAuth,
  getSocketUser,
} from '../../../common/realtime/socket-auth';
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
    private readonly sessions: RealtimeSessionRegistry,
  ) {}

  afterInit(server: Server): void {
    applySocketAuth(server, this.accessTokenVerifier, this.logger);
    this.publisher.attach(server);
    this.logger.log(
      `Trade WS ready ns=${TRADE_WS_NAMESPACE} cors=${this.configService.get<string>('CORS_ORIGINS') ?? 'default'}`,
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
      await client.join(tradeUserRoom(user.userId));
    }
  }

  handleDisconnect(client: Socket): void {
    this.sessions.untrack(client);
    this.logger.debug(`Trade WS disconnect id=${client.id}`);
  }
}
