import { MemoryPresenceStore } from './memory-presence.store';

describe('MemoryPresenceStore', () => {
  let store: MemoryPresenceStore;

  const userId = '11111111-1111-1111-1111-111111111111';
  const socketA = 'socket-a';
  const socketB = 'socket-b';

  beforeEach(() => {
    store = new MemoryPresenceStore();
  });

  it('tracks multiple sockets per user', async () => {
    await store.markSocketConnected(userId, socketA);
    await store.markSocketConnected(userId, socketB);

    const sockets = await store.getUserSocketIds(userId);
    expect(sockets).toContain(socketA);
    expect(sockets).toContain(socketB);
    expect(await store.isUserOnline(userId)).toBe(true);
  });

  it('removes only the disconnected socket', async () => {
    await store.markSocketConnected(userId, socketA);
    await store.markSocketConnected(userId, socketB);
    await store.markSocketDisconnected(userId, socketA);

    const sockets = await store.getUserSocketIds(userId);
    expect(sockets).not.toContain(socketA);
    expect(sockets).toContain(socketB);
    expect(await store.isUserOnline(userId)).toBe(true);
  });

  it('reports user offline after last socket disconnects', async () => {
    await store.markSocketConnected(userId, socketA);
    await store.markSocketConnected(userId, socketB);
    await store.markSocketDisconnected(userId, socketA);
    await store.markSocketDisconnected(userId, socketB);

    expect(await store.isUserOnline(userId)).toBe(false);
    expect(await store.getUserSocketIds(userId)).toEqual([]);
  });

  it('clears a socket by id', async () => {
    await store.markSocketConnected(userId, socketA);
    await store.clearSocket(socketA);

    expect(await store.isUserOnline(userId)).toBe(false);
  });

  it('returns online user ids from a list', async () => {
    await store.markSocketConnected(userId, socketA);

    const online = await store.getOnlineUserIds([userId, 'other-user']);
    expect(online).toEqual([userId]);
  });

  it('reports memory mode diagnostics', () => {
    const diagnostics = store.getDiagnostics();
    expect(diagnostics.mode).toBe('memory');
    expect(diagnostics.status).toBe('not_configured');
  });
});
