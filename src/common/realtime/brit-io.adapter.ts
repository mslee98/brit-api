import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/** 짧은 끊김(엘리베이터·화면 꺼짐 직후) 동안 놓친 이벤트를 재연결 시 다시 보내는 시간 */
const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

/**
 * 모든 gateway가 공유하는 Socket.IO 서버에 연결 상태 복구를 켠다.
 * 기본 메모리 adapter 기준이다. 여러 인스턴스로 늘리면 Redis Streams adapter가 필요하다.
 */
export class BritIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      connectionStateRecovery: {
        maxDisconnectionDuration: RECOVERY_WINDOW_MS,
        skipMiddlewares: true,
      },
    });
  }
}
