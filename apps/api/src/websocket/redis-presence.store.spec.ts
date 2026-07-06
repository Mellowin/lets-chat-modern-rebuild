import type { Redis } from 'ioredis';
import { RedisPresenceStore } from './redis-presence.store';

const mockPipeline = {
  sadd: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  srem: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  scard: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

const mockRedis = {
  on: jest.fn(),
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  smembers: jest.fn(),
  scard: jest.fn(),
  get: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => mockRedis),
  };
});

describe('RedisPresenceStore', () => {
  let store: RedisPresenceStore;

  const userId = '11111111-1111-1111-1111-111111111111';
  const socketId = 'socket-1';

  beforeEach(() => {
    jest.clearAllMocks();
    store = new RedisPresenceStore(mockRedis as unknown as Redis);
  });

  it('tracks a socket via pipeline', async () => {
    mockPipeline.exec.mockResolvedValue([]);

    await store.markSocketConnected(userId, socketId);

    expect(mockPipeline.sadd).toHaveBeenCalledWith(
      `presence:user:${userId}:sockets`,
      socketId,
    );
    expect(mockPipeline.set).toHaveBeenCalledWith(
      `presence:socket:${socketId}`,
      userId,
    );
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('removes a socket via pipeline', async () => {
    mockPipeline.exec.mockResolvedValue([]);

    await store.markSocketDisconnected(userId, socketId);

    expect(mockPipeline.srem).toHaveBeenCalledWith(
      `presence:user:${userId}:sockets`,
      socketId,
    );
    expect(mockPipeline.del).toHaveBeenCalledWith(
      `presence:socket:${socketId}`,
    );
  });

  it('reports online when scard > 0', async () => {
    mockRedis.scard.mockResolvedValue(1);

    const online = await store.isUserOnline(userId);

    expect(online).toBe(true);
    expect(mockRedis.scard).toHaveBeenCalledWith(
      `presence:user:${userId}:sockets`,
    );
  });

  it('reports offline when scard is 0', async () => {
    mockRedis.scard.mockResolvedValue(0);

    const online = await store.isUserOnline(userId);

    expect(online).toBe(false);
  });

  it('clears a socket by looking up user id', async () => {
    mockRedis.get.mockResolvedValue(userId);
    mockPipeline.exec.mockResolvedValue([]);

    await store.clearSocket(socketId);

    expect(mockRedis.get).toHaveBeenCalledWith(`presence:socket:${socketId}`);
    expect(mockPipeline.srem).toHaveBeenCalledWith(
      `presence:user:${userId}:sockets`,
      socketId,
    );
    expect(mockPipeline.del).toHaveBeenCalledWith(
      `presence:socket:${socketId}`,
    );
  });

  it('returns redis mode diagnostics', () => {
    const diagnostics = store.getDiagnostics();
    expect(diagnostics.mode).toBe('redis');
    expect(diagnostics.status).toBe('ok');
  });

  it('marks status degraded on redis error', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    const errorHandler = mockRedis.on.mock.calls.find(
      (call) => call[0] === 'error',
    )?.[1];
    expect(errorHandler).toBeDefined();

    errorHandler?.(new Error('Connection refused'));
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

    const diagnostics = store.getDiagnostics();
    expect(diagnostics.status).toBe('degraded');
  });

  it('diagnostics response does not include redis url or secrets', () => {
    const diagnostics = store.getDiagnostics();
    const json = JSON.stringify(diagnostics).toLowerCase();
    expect(json).not.toContain('redis://');
    expect(json).not.toContain('password');
    expect(json).not.toContain('secret');
  });

  it('disconnects the redis client on application shutdown', () => {
    store.onApplicationShutdown();
    expect(mockRedis.disconnect).toHaveBeenCalled();
  });
});
