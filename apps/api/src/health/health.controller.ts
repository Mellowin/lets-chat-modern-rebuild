import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Redis } from 'ioredis';
import { PrismaService } from '@lets-chat/database';
import { StorageService } from '../storage/storage.service';
import { SkipThrottle } from '../rate-limiting/rate-limiting.module';

type ComponentStatus = 'ok' | 'error';

interface HealthComponents {
  database: ComponentStatus;
  redis: ComponentStatus;
  storage: ComponentStatus;
}

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get()
  async root(@Res() res: Response) {
    return this.ready(res);
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const components = await this.checkComponents();
    const isHealthy = Object.values(components).every((s) => s === 'ok');

    res.status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    res.json({
      status: isHealthy ? 'ok' : 'degraded',
      components,
    });
  }

  private async checkComponents(): Promise<HealthComponents> {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.storage.checkHealth(),
    ]);

    return { database, redis, storage };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Database health check timeout')),
        2000,
      );
    });

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`.finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        }),
        timeoutPromise,
      ]);
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      return 'error';
    }

    const client = new Redis(redisUrl, {
      connectTimeout: 2000,
      commandTimeout: 2000,
      lazyConnect: true,
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Redis health check timeout')),
        2500,
      );
    });

    try {
      await Promise.race([
        client
          .connect()
          .then(() => client.ping())
          .finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
          }),
        timeoutPromise,
      ]);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      try {
        client.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  }
}
