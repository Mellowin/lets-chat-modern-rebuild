import { Controller, Get, INestApplication, Module, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import type { Request } from 'express';

@Controller()
class ProxyIpTestController {
  @Get()
  root(@Req() req: Request) {
    return { ip: req.ip };
  }
}

@Module({
  controllers: [ProxyIpTestController],
})
class TestProxyIpModule {}

async function createApp(trustProxy: boolean): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [TestProxyIpModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  if (trustProxy) {
    app.set('trust proxy', 1);
  }
  await app.init();
  return app;
}

describe('Proxy IP (e2e)', () => {
  it('ignores X-Forwarded-For when trust proxy is disabled', async () => {
    const app = await createApp(false);
    try {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('X-Forwarded-For', '203.0.113.1')
        .expect(200);

      const body = res.body as { ip: string };
      expect(body.ip).not.toBe('203.0.113.1');
    } finally {
      await app.close();
    }
  });

  it('uses X-Forwarded-For when trust proxy is enabled', async () => {
    const app = await createApp(true);
    try {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('X-Forwarded-For', '203.0.113.1')
        .expect(200);

      const body = res.body as { ip: string };
      expect(body.ip).toBe('203.0.113.1');
    } finally {
      await app.close();
    }
  });
});
