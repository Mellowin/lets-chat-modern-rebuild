import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '@lets-chat/database';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
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
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NODE_ENV') return 'test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
    prisma = moduleRef.get(PrismaService);
  });

  it('returns ok when database is healthy', async () => {
    jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);

    const req = { id: 'req-123' } as unknown as Parameters<
      typeof controller.check
    >[0];
    const result = await controller.check(req);

    expect(result.status).toBe('ok');
    expect(result.database).toBe('ok');
    expect(result.environment).toBe('test');
    expect(result.requestId).toBe('req-123');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptime).toBe('number');
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
  });

  it('returns degraded when database query fails', async () => {
    jest.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('DB down'));

    const req = { id: 'req-456' } as unknown as Parameters<
      typeof controller.check
    >[0];
    const result = await controller.check(req);

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('error');
    expect(result.requestId).toBe('req-456');
  });

  it('does not expose secrets in response', async () => {
    jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '1': 1 }]);

    const req = { id: 'req-789' } as unknown as Parameters<
      typeof controller.check
    >[0];
    const result = await controller.check(req);

    const json = JSON.stringify(result);
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('PASSWORD');
    expect(json).not.toContain('TOKEN');
  });
});
