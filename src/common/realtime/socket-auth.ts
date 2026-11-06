import type { Logger } from '@nestjs/common';
import type { Namespace, Server, Socket } from 'socket.io';

import type { AccessTokenVerifier } from '../../modules/auth/access-token.verifier';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** 클라이언트는 connect_error의 message로 받아 토큰 갱신 후 재연결한다 */
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';

type SocketAuthData = { user?: AuthenticatedUser };

export function extractSocketToken(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token.trim()) {
    return auth.token.trim();
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

function unauthorizedError(): Error & { data: { code: string } } {
  return Object.assign(new Error(SOCKET_UNAUTHORIZED), {
    data: { code: SOCKET_UNAUTHORIZED },
  });
}

/**
 * handshake 인증을 namespace 미들웨어로 건다.
 * handleConnection에서 끊으면 클라이언트는 이유를 모른 채 재연결을 멈추므로,
 * 미들웨어 에러(connect_error)로 돌려줘야 토큰을 갱신하고 다시 붙을 수 있다.
 */
export function applySocketAuth(
  namespace: Server | Namespace,
  verifier: AccessTokenVerifier,
  logger: Logger,
): void {
  namespace.use((socket, next) => {
    const token = extractSocketToken(socket);
    if (!token) {
      next(unauthorizedError());
      return;
    }
    verifier
      .verify(token)
      .then((user) => {
        (socket.data as SocketAuthData).user = user;
        next();
      })
      .catch((error: unknown) => {
        logger.debug(
          `WS handshake rejected: ${error instanceof Error ? error.message : String(error)}`,
        );
        next(unauthorizedError());
      });
  });
}

export function getSocketUser(socket: Socket): AuthenticatedUser | null {
  return (socket.data as SocketAuthData).user ?? null;
}
