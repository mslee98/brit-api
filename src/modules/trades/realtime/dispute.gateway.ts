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
import { In, Repository } from 'typeorm';

import { RealtimeSessionRegistry } from '../../../common/realtime/realtime-session.registry';
import {
  applySocketAuth,
  getSocketUser,
} from '../../../common/realtime/socket-auth';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AccessTokenVerifier } from '../../auth/access-token.verifier';
import { AuthClientType } from '../../auth/domain/enums/auth-client-type.enum';
import { AdminProfileEntity } from '../../admins/infrastructure/entities/admin-profile.entity';
import { RoleGrantStatus } from '../../users/domain/enums/role-grant-status.enum';
import { UserRole } from '../../users/domain/enums/user-role.enum';
import { UserRoleEntity } from '../../users/infrastructure/entities/user-role.entity';
import { TradeService } from '../trade.service';
import {
  ADMIN_DISPUTES_ROOM,
  DISPUTE_WS_EVENTS,
  DISPUTE_WS_NAMESPACE,
  disputeRoom,
  partyUserRoom,
} from './dispute-realtime.constants';
import { DisputeRealtimePublisher } from './dispute-realtime.publisher';

type JoinBody = { disputeId?: string };

function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  const value =
    raw ||
    'http://localhost:5173,http://localhost:5174,http://localhost:5175';
  const origins = value
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

@WebSocketGateway({
  namespace: DISPUTE_WS_NAMESPACE,
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  },
})
export class DisputeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DisputeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly tradeService: TradeService,
    private readonly publisher: DisputeRealtimePublisher,
    private readonly configService: ConfigService,
    @InjectRepository(AdminProfileEntity)
    private readonly adminProfileRepository: Repository<AdminProfileEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepository: Repository<UserRoleEntity>,
    private readonly sessions: RealtimeSessionRegistry,
  ) {}

  afterInit(server: Server): void {
    applySocketAuth(server, this.accessTokenVerifier, this.logger);
    this.publisher.attach(server);
    this.logger.log(
      `Dispute WS ready ns=${DISPUTE_WS_NAMESPACE} cors=${this.configService.get<string>('CORS_ORIGINS') ?? 'default'}`,
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = getSocketUser(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    this.sessions.track(client);
    // 상태 복구로 붙은 연결은 data(isAdmin)와 room이 이미 복원돼 있다.
    if (client.recovered) return;
    try {
      const isAdmin = await this.resolveIsAdmin(user);
      client.data.isAdmin = isAdmin;
      if (isAdmin) {
        await client.join(ADMIN_DISPUTES_ROOM);
      } else {
        await client.join(partyUserRoom(user.userId));
      }
    } catch (error) {
      this.logger.warn(
        `WS connect rejected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.sessions.untrack(client);
    this.logger.debug(`WS disconnect id=${client.id}`);
  }

  @SubscribeMessage(DISPUTE_WS_EVENTS.JOIN)
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinBody,
  ): Promise<{ ok: true; disputeId: string }> {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new WsException('UNAUTHORIZED');
    }
    const disputeId = body?.disputeId?.trim();
    if (!disputeId) {
      throw new WsException('DISPUTE_ID_REQUIRED');
    }

    if (client.data.isAdmin) {
      await client.join(disputeRoom(disputeId));
      return { ok: true, disputeId };
    }

    await this.tradeService.getMyDispute(user.userId, disputeId);
    await client.join(disputeRoom(disputeId));
    return { ok: true, disputeId };
  }

  @SubscribeMessage(DISPUTE_WS_EVENTS.LEAVE)
  async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinBody,
  ): Promise<{ ok: true }> {
    const disputeId = body?.disputeId?.trim();
    if (disputeId) {
      await client.leave(disputeRoom(disputeId));
    }
    return { ok: true };
  }

  private async resolveIsAdmin(user: AuthenticatedUser): Promise<boolean> {
    if (user.clientType !== AuthClientType.ADMIN) {
      return false;
    }
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SYS_ADMIN) {
      return false;
    }
    const activeRole = await this.roleRepository.findOne({
      where: {
        userId: user.userId,
        role: In([UserRole.ADMIN, UserRole.SYS_ADMIN]),
        status: RoleGrantStatus.ACTIVE,
      },
    });
    if (!activeRole) {
      return false;
    }
    const profile = await this.adminProfileRepository.findOne({
      where: { userId: user.userId },
    });
    return Boolean(profile?.isActive);
  }
}
