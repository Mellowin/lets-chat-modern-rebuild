import { Test, type TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { PrismaService } from '@lets-chat/database';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import { Redis } from 'ioredis';

jest.mock('ioredis', () => ({
  Redis: jest.fn(),
}));

interface HealthPayload {
  status: string;
  components: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    storage: 'ok' | 'error';
  };
}

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: jest.Mocked<PrismaService>;
  let storage: jest.Mocked<StorageService>;
  let config: jest.Mocked<ConfigService>;
  let response: jest.Mocked<Response>;
  let redisConnect: jest.Mock;
  let redisPing: jest.Mock;

  beforeEach(async () => {
    redisConnect = jest.fn().mockResolvedValue(undefined);
    redisPing = jest.fn().mockResolvedValue('PONG');

    (Redis as unknown as jest.Mock).mockImplementation(() => ({
      connect: redisConnect,
      ping: redisPing,
      disconnect: jest.fn(),
    }));

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            checkHealth: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NODE_ENV') return 'test';
              if (key === 'REDIS_URL') return 'redis://localhost:6379';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
    prisma = moduleRef.get(PrismaService);
    storage = moduleRef.get(StorageService);
    config = moduleRef.get(ConfigService);

    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Response>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function lastPayload(): HealthPayload {
    const jsonMock = response.json as unknown as jest.MockedFunction<
      (body: HealthPayload) => Response
    >;
    return jsonMock.mock.calls[0][0];
  }

  describe('live', () => {
    it('returns ok without checking dependencies', () => {
      const result = controller.live();
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('ready', () => {
    it('returns ok when all components are healthy', async () => {
      jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('ok');

      await controller.ready(response);

      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({
        status: 'ok',
        components: {
          database: 'ok',
          redis: 'ok',
          storage: 'ok',
        },
      });
    });

    it('returns degraded with 503 when database fails', async () => {
      jest.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('DB down'));
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('ok');

      await controller.ready(response);

      expect(response.status).toHaveBeenCalledWith(503);
      const payload = lastPayload();
      expect(payload.status).toBe('degraded');
      expect(payload.components.database).toBe('error');
      expect(payload.components.redis).toBe('ok');
      expect(payload.components.storage).toBe('ok');
    });

    it('returns degraded with 503 when redis fails', async () => {
      jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('ok');
      redisConnect.mockRejectedValueOnce(new Error('Redis down'));

      await controller.ready(response);

      expect(response.status).toHaveBeenCalledWith(503);
      const payload = lastPayload();
      expect(payload.components.database).toBe('ok');
      expect(payload.components.redis).toBe('error');
      expect(payload.components.storage).toBe('ok');
    });

    it('returns degraded with 503 when storage fails', async () => {
      jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('error');

      await controller.ready(response);

      expect(response.status).toHaveBeenCalledWith(503);
      const payload = lastPayload();
      expect(payload.components.database).toBe('ok');
      expect(payload.components.redis).toBe('ok');
      expect(payload.components.storage).toBe('error');
    });

    it('returns degraded when redis is not configured', async () => {
      jest.mocked(config.get).mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });
      jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('ok');

      await controller.ready(response);

      expect(response.status).toHaveBeenCalledWith(503);
      const payload = lastPayload();
      expect(payload.components.redis).toBe('error');
    });

    it('handles database timeout gracefully', async () => {
      jest.useFakeTimers();
      jest
        .mocked(prisma.$queryRaw)
        .mockReturnValue(
          new Promise(() => {}) as ReturnType<typeof prisma.$queryRaw>,
        );
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('ok');

      const readyPromise = controller.ready(response);
      jest.advanceTimersByTime(3000);
      await readyPromise;

      expect(response.status).toHaveBeenCalledWith(503);
      const payload = lastPayload();
      expect(payload.components.database).toBe('error');

      jest.runAllTimers();
      jest.useRealTimers();
    });

    it('does not expose secrets in response', async () => {
      jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);
      jest.mocked(storage.checkHealth).mockResolvedValueOnce('ok');
      jest.mocked(config.get).mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'REDIS_URL') return 'redis://user:secret@localhost:6379';
        return undefined;
      });

      await controller.ready(response);

      const payload = lastPayload();
      const json = JSON.stringify(payload);
      expect(json).not.toContain('secret');
      expect(json).not.toContain('password');
      expect(json).not.toContain('localhost:6379');
    });
  });
});
