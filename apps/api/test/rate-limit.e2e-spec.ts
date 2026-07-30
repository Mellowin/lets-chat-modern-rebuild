import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  StrictThrottle,
  SkipThrottle,
} from './../src/rate-limiting/rate-limiting.module';

@Controller()
class RateLimitTestController {
  @Get('global')
  global() {
    return { ok: true };
  }

  @Get('strict')
  @StrictThrottle(1, 1)
  strict() {
    return { ok: true };
  }

  @Get('open')
  @SkipThrottle()
  open() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 1000, limit: 2 }],
    }),
  ],
  controllers: [RateLimitTestController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
class TestRateLimitModule {}

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.THROTTLER_ENABLED = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [TestRateLimitModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies the global throttle and returns 429 with Retry-After', async () => {
    await request(app.getHttpServer()).get('/global').expect(200);
    await request(app.getHttpServer()).get('/global').expect(200);

    const res = await request(app.getHttpServer()).get('/global').expect(429);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
  });

  it('applies @StrictThrottle with lower limits', async () => {
    await request(app.getHttpServer()).get('/strict').expect(200);

    const res = await request(app.getHttpServer()).get('/strict').expect(429);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
  });

  it('skips throttle for @SkipThrottle routes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/open').expect(200);
    }
  });
});
