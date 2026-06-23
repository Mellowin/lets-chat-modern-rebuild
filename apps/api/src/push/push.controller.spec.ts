import { Server } from 'http';
import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { PushController } from './push.controller';
import { PushService } from './push.service';

const mockUser = { id: 'user-1', email: 'a@b.com', username: 'alice' };

class MockJwtAccessGuard {
  private allow = true;

  setAllow(value: boolean) {
    this.allow = value;
  }

  canActivate(context: ExecutionContext) {
    if (!this.allow) return false;
    const request = context
      .switchToHttp()
      .getRequest<{ user?: typeof mockUser }>();
    request.user = mockUser;
    return true;
  }
}

describe('PushController', () => {
  let app: INestApplication;
  let pushService: {
    getVapidPublicKey: jest.Mock;
    saveSubscription: jest.Mock;
    listSubscriptions: jest.Mock;
    removeSubscription: jest.Mock;
  };
  let guard: MockJwtAccessGuard;

  beforeEach(async () => {
    pushService = {
      getVapidPublicKey: jest.fn(),
      saveSubscription: jest.fn().mockResolvedValue(undefined),
      listSubscriptions: jest.fn().mockResolvedValue([]),
      removeSubscription: jest.fn().mockResolvedValue(undefined),
    };

    guard = new MockJwtAccessGuard();

    const moduleRef = await Test.createTestingModule({
      controllers: [PushController],
      providers: [{ provide: PushService, useValue: pushService }],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue(guard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /push/vapid-public-key', () => {
    it('returns the configured public key', async () => {
      pushService.getVapidPublicKey.mockReturnValue('public-key-123');

      const response = await request(app.getHttpServer() as Server)
        .get('/push/vapid-public-key')
        .expect(200);

      expect(response.body).toEqual({ publicKey: 'public-key-123' });
    });

    it('returns 503 when push is not configured', async () => {
      pushService.getVapidPublicKey.mockReturnValue(null);

      await request(app.getHttpServer() as Server)
        .get('/push/vapid-public-key')
        .expect(503);
    });
  });

  describe('POST /push/subscribe', () => {
    it('rejects unauthenticated requests', async () => {
      guard.setAllow(false);

      await request(app.getHttpServer() as Server)
        .post('/push/subscribe')
        .send({ endpoint: 'https://push.example/1', keys: {} })
        .expect(403);
    });

    it('saves a subscription for the authenticated user', async () => {
      const dto = {
        endpoint: 'https://push.example/1',
        keys: {
          p256dh: 'p256dh',
          auth: 'auth',
        },
      };

      const response = await request(app.getHttpServer() as Server)
        .post('/push/subscribe')
        .send(dto)
        .expect(201);

      expect(response.body).toEqual({ success: true });
      expect(pushService.saveSubscription).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      );
    });

    it('rejects invalid input', async () => {
      await request(app.getHttpServer() as Server)
        .post('/push/subscribe')
        .send({ endpoint: 'https://push.example/1' })
        .expect(400);
    });
  });

  describe('GET /push/subscriptions', () => {
    it('rejects unauthenticated requests', async () => {
      guard.setAllow(false);

      await request(app.getHttpServer() as Server)
        .get('/push/subscriptions')
        .expect(403);
    });

    it('returns the current user subscriptions without leaking secrets', async () => {
      pushService.listSubscriptions.mockResolvedValue([
        {
          id: 'sub-1',
          endpointPreview: 'https://push.example/1…',
          userAgent: 'Mozilla/5.0',
          deviceLabel: 'Web browser',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastUsedAt: null,
          disabledAt: null,
        },
      ]);

      const response = await request(app.getHttpServer() as Server)
        .get('/push/subscriptions')
        .expect(200);

      const body = response.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      const bodyText = JSON.stringify(body);
      expect(bodyText).not.toContain('p256dh');
      expect(bodyText).not.toContain('auth');
      const firstItem = body[0];
      expect(firstItem).toHaveProperty('endpointPreview');
      expect(firstItem).not.toHaveProperty('endpoint');
    });
  });

  describe('POST /push/unsubscribe', () => {
    it('removes the subscription for the authenticated user', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/push/unsubscribe')
        .send({ endpoint: 'https://push.example/1' })
        .expect(201);

      expect(response.body).toEqual({ success: true });
      expect(pushService.removeSubscription).toHaveBeenCalledWith(
        mockUser.id,
        'https://push.example/1',
      );
    });
  });

  describe('DELETE /push/unsubscribe', () => {
    it('also removes the subscription for the authenticated user', async () => {
      const response = await request(app.getHttpServer() as Server)
        .delete('/push/unsubscribe')
        .send({ endpoint: 'https://push.example/1' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(pushService.removeSubscription).toHaveBeenCalledWith(
        mockUser.id,
        'https://push.example/1',
      );
    });
  });
});
