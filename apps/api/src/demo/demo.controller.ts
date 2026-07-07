import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Get('status')
  getStatus() {
    return { enabled: this.demoService.isDemoModeEnabled() };
  }

  @Post('session')
  @HttpCode(201)
  async createSession(@Req() req: Request) {
    if (!this.demoService.isDemoModeEnabled()) {
      throw new NotFoundException();
    }

    const ipAddress = this.extractClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    return this.demoService.createSession(ipAddress, userAgent);
  }

  private extractClientIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return req.ip ?? null;
  }
}
