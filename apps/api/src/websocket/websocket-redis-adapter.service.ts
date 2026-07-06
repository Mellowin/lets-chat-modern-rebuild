import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

export type WebsocketAdapterMode = 'memory' | 'redis';

export type WebsocketAdapterStatus =
  | 'ok'
  | 'not_configured'
  | 'degraded'
  | 'error';

export interface WebsocketDiagnostics {
  enabled: true;
  adapter: WebsocketAdapterMode;
  status: WebsocketAdapterStatus;
}

@Injectable()
export class WebsocketRedisAdapterService implements OnApplicationShutdown {
  private readonly logger = new Logger(WebsocketRedisAdapterService.name);
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private adapter: ReturnType<typeof createAdapter> | null = null;
  private mode: WebsocketAdapterMode = 'memory';
  private status: WebsocketAdapterStatus = 'not_configured';
  private attached = false;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('WEBSOCKET_REDIS_URL');
    if (!url) {
      this.mode = 'memory';
      this.status = 'not_configured';
      return;
    }

    try {
      this.pubClient = new Redis(url, {
        lazyConnect: true,
        connectionName: 'socket.io-pub',
      });
      this.subClient = new Redis(url, {
        lazyConnect: true,
        connectionName: 'socket.io-sub',
      });

      this.pubClient.on('error', (error) => {
        this.handleRedisError('pub', error);
      });
      this.subClient.on('error', (error) => {
        this.handleRedisError('sub', error);
      });

      this.adapter = createAdapter(this.pubClient, this.subClient);
      this.mode = 'redis';
      this.status = 'ok';
    } catch (error) {
      this.mode = 'memory';
      this.status = 'degraded';
      this.logger.error(
        {
          error: this.safeErrorMessage(error),
        },
        'Failed to create Socket.io Redis adapter; falling back to in-memory adapter',
      );
      this.destroyClients();
    }
  }

  attachTo(server: Server): void {
    if (this.mode !== 'redis' || !this.adapter) {
      this.logger.log(
        { adapter: this.mode, status: this.status },
        'Socket.io running with in-memory adapter',
      );
      return;
    }

    try {
      server.adapter(this.adapter);
      this.attached = true;
      this.logger.log(
        { adapter: 'redis', status: 'ok' },
        'Socket.io Redis adapter attached',
      );
    } catch (error) {
      this.status = 'degraded';
      this.attached = false;
      this.logger.error(
        { error: this.safeErrorMessage(error) },
        'Failed to attach Socket.io Redis adapter; fallback to in-memory adapter active',
      );
    }
  }

  getDiagnostics(): WebsocketDiagnostics {
    return {
      enabled: true,
      adapter: this.mode,
      status: this.status,
    };
  }

  onApplicationShutdown(): void {
    this.destroyClients();
  }

  private handleRedisError(role: 'pub' | 'sub', error: Error): void {
    const safeMessage = this.safeErrorMessage(error);
    if (this.attached) {
      this.status = 'degraded';
    }
    this.logger.warn(
      { role, error: safeMessage },
      'Socket.io Redis client error',
    );
  }

  private safeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unknown error';
    }
    let message = error.message ?? 'Unknown error';
    const url = this.config.get<string>('WEBSOCKET_REDIS_URL');
    if (url) {
      try {
        const redacted = new URL(url);
        const password = redacted.password;
        if (password) {
          message = message.replaceAll(password, '[REDACTED]');
        }
        const username = redacted.username;
        if (username) {
          message = message.replaceAll(username, '[REDACTED]');
        }
      } catch {
        // URL parsing failed; do not attempt to redact.
      }
    }
    return message;
  }

  private destroyClients(): void {
    try {
      this.pubClient?.disconnect();
    } catch {
      // ignore cleanup errors
    }
    try {
      this.subClient?.disconnect();
    } catch {
      // ignore cleanup errors
    }
    this.pubClient = null;
    this.subClient = null;
    this.adapter = null;
  }
}
