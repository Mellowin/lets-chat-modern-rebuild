import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminDiagnosticsService } from './admin-diagnostics.service';
import { PrismaService } from '@lets-chat/database';
import { PushService } from '../push/push.service';

describe('AdminDiagnosticsService', () => {
  let service: AdminDiagnosticsService;
  let prisma: jest.Mocked<Pick<PrismaService, '$queryRaw'>>;
  let config: jest.Mocked<ConfigService>;
  let push: jest.Mocked<Pick<PushService, 'isVapidConfigured'>>;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
    };
    config = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    push = {
      isVapidConfigured: jest.fn().mockReturnValue(false),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminDiagnosticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: PushService, useValue: push },
      ],
    }).compile();

    service = moduleRef.get(AdminDiagnosticsService);
  });

  function givenConfig(values: Record<string, string>) {
    (config.get as jest.Mock).mockImplementation(
      (key: string, fallback?: unknown) => {
        return key in values ? values[key] : fallback;
      },
    );
  }

  it('health returns ok when database is healthy', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    givenConfig({ NODE_ENV: 'test' });

    const result = await service.getHealth('req-1');

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.api.status).toBe('ok');
    expect(result.requestId).toBe('req-1');
    expect(result.environment).toBe('test');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptime).toBe('number');
  });

  it('health returns degraded when database check fails', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(
      new Error('connection lost'),
    );
    givenConfig({ NODE_ENV: 'test' });

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('error');
    expect(result.checks.database.detail).toBe('connection lost');
  });

  it('config summary returns only safe booleans and capabilities', () => {
    givenConfig({
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY: 'key',
      S3_SECRET_KEY: 'secret',
      S3_BUCKET: 'bucket',
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_xxx',
      REDIS_URL: 'redis://localhost',
      RATE_LIMIT_ENABLED: 'true',
    });
    push.isVapidConfigured.mockReturnValue(true);

    const result = service.getConfig();

    expect(result.push).toBe(true);
    expect(result.pwa).toBe(true);
    expect(result.attachments).toBe(true);
    expect(result.email).toBe(true);
    expect(result.redis).toBe(true);
    expect(result.rateLimit).toBe(true);
    expect(result.websocket).toBe(true);
    expect(result.adminModeration).toBe(true);
    expect(result.messageSearch).toBe(true);
  });

  it('config summary reports false for unconfigured services', () => {
    givenConfig({
      S3_ENDPOINT: '',
      MAIL_PROVIDER: 'console',
    });

    const result = service.getConfig();

    expect(result.push).toBe(false);
    expect(result.attachments).toBe(false);
    expect(result.email).toBe(false);
    expect(result.redis).toBe(false);
    expect(result.rateLimit).toBe(false);
  });

  it('health response does not include sensitive env keys or secrets', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    givenConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://secret',
      REDIS_URL: 'redis://secret',
      JWT_ACCESS_SECRET: 'super-secret',
      RESEND_API_KEY: 're_secret',
      VAPID_PRIVATE_KEY: 'private-key',
      S3_SECRET_KEY: 's3-secret',
    });

    const result = await service.getHealth();
    const json = JSON.stringify(result).toLowerCase();

    expect(json).not.toContain('database_url');
    expect(json).not.toContain('redis_url');
    expect(json).not.toContain('jwt_secret');
    expect(json).not.toContain('resend');
    expect(json).not.toContain('vapid_private');
    expect(json).not.toContain('s3_secret');
    expect(json).not.toContain('postgresql://secret');
    expect(json).not.toContain('super-secret');
    expect(json).not.toContain('private-key');
    expect(json).not.toContain('s3-secret');
  });
});
