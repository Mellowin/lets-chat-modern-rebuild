import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import helmet from 'helmet';

@Controller()
class SecurityHeadersTestController {
  @Get()
  root() {
    return { ok: true };
  }
}

@Module({
  controllers: [SecurityHeadersTestController],
})
class TestSecurityHeadersModule {}

async function createApp(withHelmet: boolean): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [TestSecurityHeadersModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  if (withHelmet) {
    app.use(helmet());
  }
  await app.init();
  return app;
}

describe('Security headers (e2e)', () => {
  it('sets helmet headers when helmet is enabled', async () => {
    const app = await createApp(true);
    try {
      const res = await request(app.getHttpServer()).get('/').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('does not set helmet headers when helmet is disabled', async () => {
    const app = await createApp(false);
    try {
      const res = await request(app.getHttpServer()).get('/').expect(200);
      expect(res.headers['x-content-type-options']).toBeUndefined();
      expect(res.headers['x-frame-options']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
