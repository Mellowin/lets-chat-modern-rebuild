import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '@lets-chat/database';
import { PushService } from '../push/push.service';
import { WebsocketRedisAdapterService } from '../websocket/websocket-redis-adapter.service';
import { PresenceService } from '../websocket/presence.service';

export type CheckStatus = 'ok' | 'not_configured' | 'degraded' | 'error';

export interface DiagnosticsCheck {
  status: CheckStatus;
  detail?: string;
}

export interface DiagnosticsHealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  requestId?: string;
  checks: {
    api: DiagnosticsCheck;
    database: DiagnosticsCheck;
    redis: DiagnosticsCheck;
    websocket: DiagnosticsCheck;
    presence: DiagnosticsCheck;
    push: DiagnosticsCheck;
    attachments: DiagnosticsCheck;
    mail: DiagnosticsCheck;
  };
}

export interface DiagnosticsConfigResponse {
  push: boolean;
  pwa: boolean;
  attachments: boolean;
  email: boolean;
  redis: boolean;
  rateLimit: boolean;
  websocket: boolean;
  adminModeration: boolean;
  messageSearch: boolean;
  demoMode: 'enabled' | 'disabled';
}

export interface DiagnosticsChecksResponse {
  timestamp: string;
  requestId?: string;
  checks: DiagnosticsHealthResponse['checks'];
}

@Injectable()
export class AdminDiagnosticsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly websocketAdapter: WebsocketRedisAdapterService,
    private readonly presence: PresenceService,
  ) {}

  async getHealth(requestId?: string): Promise<DiagnosticsHealthResponse> {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    const environment = this.config.get<string>('NODE_ENV', 'development');
    const version = this.getVersion();

    const checks = await this.runChecks();
    const degraded = Object.values(checks).some(
      (check) => check.status === 'error',
    );

    return {
      status: degraded ? 'degraded' : 'ok',
      timestamp,
      uptime,
      environment,
      version,
      requestId,
      checks,
    };
  }

  async getChecks(requestId?: string): Promise<DiagnosticsChecksResponse> {
    return {
      timestamp: new Date().toISOString(),
      requestId,
      checks: await this.runChecks(),
    };
  }

  getConfig(): DiagnosticsConfigResponse {
    return {
      push: this.isPushConfigured(),
      pwa: true,
      attachments: this.isAttachmentsConfigured(),
      email: this.isEmailConfigured(),
      redis: this.isRedisConfigured(),
      rateLimit: this.isRateLimitConfigured(),
      websocket: true,
      adminModeration: true,
      messageSearch: true,
      demoMode: this.isDemoModeEnabled() ? 'enabled' : 'disabled',
    };
  }

  private async runChecks(): Promise<DiagnosticsHealthResponse['checks']> {
    const database = await this.checkDatabase();
    const redis = this.checkRedis();
    const websocket = this.checkWebsocket();
    const presence = this.checkPresence();
    const push = this.checkPush();
    const attachments = this.checkAttachments();
    const mail = this.checkMail();

    return {
      api: { status: 'ok' },
      database,
      redis,
      websocket,
      presence,
      push,
      attachments,
      mail,
    };
  }

  private async checkDatabase(): Promise<DiagnosticsCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Database check failed';
      return { status: 'error', detail: message };
    }
  }

  private checkRedis(): DiagnosticsCheck {
    if (!this.isRedisConfigured()) {
      return { status: 'not_configured' };
    }
    // Redis is not currently wired into the application; presence of REDIS_URL
    // is treated as configured. A real connection check can be added when Redis
    // is adopted for caching/rate-limiting.
    return { status: 'ok' };
  }

  private checkWebsocket(): DiagnosticsCheck {
    const diagnostics = this.websocketAdapter.getDiagnostics();
    return {
      status: diagnostics.status,
      detail: `adapter:${diagnostics.adapter}`,
    };
  }

  private checkPresence(): DiagnosticsCheck {
    const diagnostics = this.presence.getDiagnostics();
    return {
      status: diagnostics.status,
      detail: `store:${diagnostics.mode}`,
    };
  }

  private checkPush(): DiagnosticsCheck {
    if (!this.isPushConfigured()) {
      return { status: 'not_configured' };
    }
    return { status: 'ok' };
  }

  private checkAttachments(): DiagnosticsCheck {
    if (!this.isAttachmentsConfigured()) {
      return { status: 'not_configured' };
    }
    return { status: 'ok' };
  }

  private checkMail(): DiagnosticsCheck {
    if (!this.isEmailConfigured()) {
      return { status: 'not_configured' };
    }
    const provider = this.config.get<string>('MAIL_PROVIDER', 'console');
    const fallback = this.config.get<string>('MAIL_FALLBACK_PROVIDER');
    const fallbackConfigured = fallback === 'smtp' && this.isSmtpConfigured();
    const fallbackDetail = fallbackConfigured ? 'smtp' : 'not_configured';
    return {
      status: 'ok',
      detail: `provider:${provider},fallback:${fallbackDetail}`,
    };
  }

  private isPushConfigured(): boolean {
    return this.push.isVapidConfigured();
  }

  private isAttachmentsConfigured(): boolean {
    return (
      this.hasConfig('S3_ENDPOINT') &&
      this.hasConfig('S3_ACCESS_KEY') &&
      this.hasConfig('S3_SECRET_KEY') &&
      this.hasConfig('S3_BUCKET')
    );
  }

  private isEmailConfigured(): boolean {
    const provider = this.config.get<string>('MAIL_PROVIDER', 'console');
    if (provider === 'console') {
      return false;
    }
    if (provider === 'resend') {
      return this.hasConfig('RESEND_API_KEY');
    }
    if (provider === 'smtp') {
      return this.isSmtpConfigured();
    }
    return false;
  }

  private isSmtpConfigured(): boolean {
    return (
      this.hasConfig('SMTP_HOST') &&
      this.hasConfig('SMTP_USER') &&
      this.hasConfig('SMTP_PASS') &&
      this.hasConfig('SMTP_FROM')
    );
  }

  private isRedisConfigured(): boolean {
    return this.hasConfig('REDIS_URL');
  }

  private isRateLimitConfigured(): boolean {
    return this.config.get<string>('RATE_LIMIT_ENABLED') === 'true';
  }

  private isDemoModeEnabled(): boolean {
    return this.config.get<boolean>('DEMO_MODE_ENABLED', false) === true;
  }

  private hasConfig(key: string): boolean {
    const value = this.config.get<string>(key);
    return typeof value === 'string' && value.length > 0;
  }

  private getVersion(): string {
    try {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        version?: string;
      };
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
