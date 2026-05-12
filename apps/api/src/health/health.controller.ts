import { Controller, Get, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '@lets-chat/database';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check(@Req() req: Request) {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    const environment = this.config.get<string>('NODE_ENV', 'development');

    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const isDegraded = dbStatus === 'error';

    return {
      status: isDegraded ? 'degraded' : 'ok',
      timestamp,
      uptime,
      environment,
      database: dbStatus,
      requestId: req.id,
    };
  }
}
