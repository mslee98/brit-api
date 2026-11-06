import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Socket } from 'socket.io';
import { DataSource } from 'typeorm';

import { getSocketUser } from './socket-auth';

/** 로그아웃·세션 폐기·계정 정지 후 열린 소켓이 남아 있는 최대 시간 */
const SESSION_SWEEP_INTERVAL_MS = 15_000;
const SESSION_SWEEP_CHUNK = 1000;

/**
 * 연결된 소켓을 세션(sid)별로 묶어 두고, 주기적으로 세션이 아직 ACTIVE인지 확인한다.
 * 세션 폐기 경로(로그아웃, 전체 로그아웃, 관리자 정지, refresh 재사용 감지 등)가 많아
 * 각 경로에 끊기 호출을 넣는 대신 한곳에서 정리한다. 단일 인스턴스 기준.
 */
@Injectable()
export class RealtimeSessionRegistry {
  private readonly logger = new Logger(RealtimeSessionRegistry.name);
  private readonly socketsBySession = new Map<string, Set<Socket>>();
  private sweeping = false;

  constructor(private readonly dataSource: DataSource) {}

  track(socket: Socket): void {
    const sessionId = getSocketUser(socket)?.sessionId;
    if (!sessionId) return;
    let sockets = this.socketsBySession.get(sessionId);
    if (!sockets) {
      sockets = new Set();
      this.socketsBySession.set(sessionId, sockets);
    }
    sockets.add(socket);
  }

  untrack(socket: Socket): void {
    const sessionId = getSocketUser(socket)?.sessionId;
    if (!sessionId) return;
    const sockets = this.socketsBySession.get(sessionId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.socketsBySession.delete(sessionId);
  }

  @Interval(SESSION_SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.sweeping || this.socketsBySession.size === 0) return;
    this.sweeping = true;
    try {
      const sessionIds = [...this.socketsBySession.keys()];
      for (let i = 0; i < sessionIds.length; i += SESSION_SWEEP_CHUNK) {
        await this.disconnectInactive(
          sessionIds.slice(i, i + SESSION_SWEEP_CHUNK),
        );
      }
    } catch (error) {
      this.logger.warn(
        `session sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweeping = false;
    }
  }

  private async disconnectInactive(sessionIds: string[]): Promise<void> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `
      SELECT id
      FROM user_sessions
      WHERE id = ANY($1::uuid[])
        AND status = 'ACTIVE'
        AND expires_at > NOW()
      `,
      [sessionIds],
    );
    const active = new Set(rows.map((row) => row.id));
    for (const sessionId of sessionIds) {
      if (active.has(sessionId)) continue;
      const sockets = this.socketsBySession.get(sessionId);
      this.socketsBySession.delete(sessionId);
      // 서버가 끊은 연결은 상태 복구 대상이 아니라 재연결 시 handshake 인증을 다시 거친다
      sockets?.forEach((socket) => socket.disconnect(true));
    }
  }
}
