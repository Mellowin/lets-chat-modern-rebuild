import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import { WebsocketRedisAdapterService } from './websocket-redis-adapter.service';

const mockCreateAdapter = jest.fn<unknown, unknown[]>();
const mockRedisInstance = {
  on: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: (...args: unknown[]) => mockCreateAdapter(...args),
}));

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

describe('WebsocketRedisAdapterService', () => {
  let service: WebsocketRedisAdapterService;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdapter.mockReturnValue({ adapter: true });
  });

  async function createService(values: Record<string, string>) {
    config = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebsocketRedisAdapterService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(WebsocketRedisAdapterService);
  }

  it('defaults to memory adapter when WEBSOCKET_REDIS_URL is missing', async () => {
    await createService({});

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.enabled).toBe(true);
    expect(diagnostics.adapter).toBe('memory');
    expect(diagnostics.status).toBe('not_configured');
  });

  it('creates Redis adapter when WEBSOCKET_REDIS_URL is set', async () => {
    await createService({ WEBSOCKET_REDIS_URL: 'redis://localhost:6379' });

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.enabled).toBe(true);
    expect(diagnostics.adapter).toBe('redis');
    expect(diagnostics.status).toBe('ok');
    expect(mockCreateAdapter).toHaveBeenCalledTimes(1);
  });

  it('attaches Redis adapter to Socket.io server', async () => {
    await createService({ WEBSOCKET_REDIS_URL: 'redis://localhost:6379' });

    const server = {
      adapter: jest.fn(),
    } as unknown as Server;

    service.attachTo(server);

    expect(
      (server as unknown as { adapter: jest.Mock }).adapter,
    ).toHaveBeenCalledWith({ adapter: true });
  });

  it('falls back to memory adapter and degrades status on Redis adapter creation error', async () => {
    mockCreateAdapter.mockImplementationOnce(() => {
      throw new Error('Redis adapter creation failed');
    });

    await createService({ WEBSOCKET_REDIS_URL: 'redis://localhost:6379' });

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.adapter).toBe('memory');
    expect(diagnostics.status).toBe('degraded');
  });

  it('does not expose Redis URL or secrets in diagnostics', async () => {
    await createService({
      WEBSOCKET_REDIS_URL: 'redis://user:secret-pass@redis.example.com:6379/0',
    });

    const json = JSON.stringify(service.getDiagnostics()).toLowerCase();
    expect(json).not.toContain('secret-pass');
    expect(json).not.toContain('redis.example.com');
    expect(json).not.toContain('redis://');
  });

  it('sanitizes Redis password from logged error messages', async () => {
    const errorMessage = 'Connection to secret-pass failed';
    mockCreateAdapter.mockImplementationOnce(() => {
      throw new Error(errorMessage);
    });

    await createService({
      WEBSOCKET_REDIS_URL: 'redis://user:secret-pass@redis.example.com:6379/0',
    });

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.status).toBe('degraded');
    expect(JSON.stringify(diagnostics)).not.toContain('secret-pass');
  });
});
