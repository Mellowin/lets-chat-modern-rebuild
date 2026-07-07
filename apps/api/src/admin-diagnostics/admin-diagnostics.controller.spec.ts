import { Test, type TestingModule } from '@nestjs/testing';
import { AdminDiagnosticsController } from './admin-diagnostics.controller';
import { AdminDiagnosticsService } from './admin-diagnostics.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { Request } from 'express';

describe('AdminDiagnosticsController', () => {
  let controller: AdminDiagnosticsController;
  let service: jest.Mocked<AdminDiagnosticsService>;

  beforeEach(async () => {
    service = {
      getHealth: jest.fn(),
      getChecks: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as jest.Mocked<AdminDiagnosticsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminDiagnosticsController],
      providers: [
        {
          provide: AdminDiagnosticsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AdminDiagnosticsController);
  });

  describe('GET /admin/diagnostics/health', () => {
    it('returns health diagnostics', async () => {
      const health = {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        uptime: 123,
        environment: 'test',
        version: '0.0.1',
        checks: {
          api: { status: 'ok' as const },
          database: { status: 'ok' as const },
          redis: { status: 'not_configured' as const },
          websocket: { status: 'not_configured' as const },
          presence: { status: 'not_configured' as const },
          push: { status: 'not_configured' as const },
          attachments: { status: 'ok' as const },
          mail: { status: 'not_configured' as const },
        },
      };
      service.getHealth.mockResolvedValue(health);

      const req = { id: 'req-123' } as unknown as Request;
      const result = await controller.health(req);

      expect(service.getHealth).toHaveBeenCalledWith('req-123');
      expect(result).toEqual(health);
    });
  });

  describe('GET /admin/diagnostics/config', () => {
    it('returns safe config summary', () => {
      const config = {
        push: false,
        pwa: true,
        attachments: true,
        email: false,
        redis: false,
        rateLimit: false,
        websocket: true,
        adminModeration: true,
        messageSearch: true,
        demoMode: 'disabled' as const,
      };
      service.getConfig.mockReturnValue(config);

      const result = controller.config();

      expect(service.getConfig).toHaveBeenCalled();
      expect(result).toEqual(config);
    });
  });

  describe('GET /admin/diagnostics/checks', () => {
    it('returns dependency checks', async () => {
      const checks = {
        timestamp: new Date().toISOString(),
        checks: {
          api: { status: 'ok' as const },
          database: { status: 'ok' as const },
          redis: { status: 'not_configured' as const },
          websocket: { status: 'not_configured' as const },
          presence: { status: 'not_configured' as const },
          push: { status: 'not_configured' as const },
          attachments: { status: 'ok' as const },
          mail: { status: 'not_configured' as const },
        },
      };
      service.getChecks.mockResolvedValue(checks);

      const req = { id: 'req-456' } as unknown as Request;
      const result = await controller.checks(req);

      expect(service.getChecks).toHaveBeenCalledWith('req-456');
      expect(result).toEqual(checks);
    });
  });
});
