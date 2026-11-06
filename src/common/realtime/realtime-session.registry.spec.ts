import type { Socket } from 'socket.io';
import type { DataSource } from 'typeorm';

import { RealtimeSessionRegistry } from './realtime-session.registry';

function fakeSocket(sessionId: string): {
  socket: Socket;
  disconnect: jest.Mock;
} {
  const disconnect = jest.fn();
  const socket = {
    data: { user: { userId: 'u', sessionId } },
    disconnect,
  } as unknown as Socket;
  return { socket, disconnect };
}

function createRegistry(activeIds: string[]) {
  const query = jest.fn<Promise<Array<{ id: string }>>, [string, unknown[]]>(
    () => Promise.resolve(activeIds.map((id) => ({ id }))),
  );
  const registry = new RealtimeSessionRegistry({
    query,
  } as unknown as DataSource);
  return { registry, query };
}

describe('RealtimeSessionRegistry', () => {
  it('ACTIVE가 아닌 세션의 소켓만 끊는다', async () => {
    const { registry, query } = createRegistry(['alive']);
    const alive = fakeSocket('alive');
    const revokedA = fakeSocket('revoked');
    const revokedB = fakeSocket('revoked');
    registry.track(alive.socket);
    registry.track(revokedA.socket);
    registry.track(revokedB.socket);

    await registry.sweep();

    expect(query.mock.calls[0][1]).toEqual([['alive', 'revoked']]);
    expect(alive.disconnect).not.toHaveBeenCalled();
    expect(revokedA.disconnect).toHaveBeenCalledWith(true);
    expect(revokedB.disconnect).toHaveBeenCalledWith(true);

    await registry.sweep();
    expect(query.mock.calls[1][1]).toEqual([['alive']]);
  });

  it('연결이 모두 끊긴 세션은 조회하지 않는다', async () => {
    const { registry, query } = createRegistry([]);
    const { socket } = fakeSocket('s1');
    registry.track(socket);
    registry.untrack(socket);

    await registry.sweep();

    expect(query).not.toHaveBeenCalled();
  });
});
