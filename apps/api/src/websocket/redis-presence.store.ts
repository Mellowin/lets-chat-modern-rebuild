import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  PresenceStore,
  PresenceStoreDiagnostics,
  PresenceStoreMode,
  PresenceStoreStatus,
} from './presence-store.interface';

@Injectable()
export class RedisPresenceStore
  implements PresenceStore, OnApplicationShutdown
{
  readonly mode: PresenceStoreMode = 'redis';

  private readonly logger = new Logger(RedisPresenceStore.name);
  private status: PresenceStoreStatus = 'ok';

  constructor(private readonly client: Redis) {
    this.client.on('error', (error) => {
      this.status = 'degraded';
      this.logger.warn(
        { error: this.safeErrorMessage(error) },
        'Presence Redis client error',
      );
    });
  }

  async markSocketConnected(userId: string, socketId: string): Promise<void> {
    const userKey = this.userSocketsKey(userId);
    const socketKey = this.socketUserKey(socketId);

    const pipeline = this.client.pipeline();
    pipeline.sadd(userKey, socketId);
    pipeline.set(socketKey, userId);
    await pipeline.exec();
  }

  async markSocketDisconnected(
    userId: string,
    socketId: string,
  ): Promise<void> {
    const userKey = this.userSocketsKey(userId);
    const socketKey = this.socketUserKey(socketId);

    const pipeline = this.client.pipeline();
    pipeline.srem(userKey, socketId);
    pipeline.del(socketKey);
    await pipeline.exec();
  }

  async getUserSocketIds(userId: string): Promise<string[]> {
    return this.client.smembers(this.userSocketsKey(userId));
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.client.scard(this.userSocketsKey(userId));
    return count > 0;
  }

  async getOnlineUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    const pipeline = this.client.pipeline();
    for (const userId of userIds) {
      pipeline.scard(this.userSocketsKey(userId));
    }
    const results = await pipeline.exec();

    const online: string[] = [];
    for (let i = 0; i < userIds.length; i++) {
      const [, count] = results?.[i] ?? [null, 0];
      if (typeof count === 'number' && count > 0) {
        online.push(userIds[i]);
      }
    }
    return online;
  }

  async clearSocket(socketId: string): Promise<void> {
    const socketKey = this.socketUserKey(socketId);
    const userId = await this.client.get(socketKey);
    if (!userId) {
      return;
    }

    const pipeline = this.client.pipeline();
    pipeline.srem(this.userSocketsKey(userId), socketId);
    pipeline.del(socketKey);
    await pipeline.exec();
  }

  getDiagnostics(): PresenceStoreDiagnostics {
    return {
      mode: this.mode,
      status: this.status,
    };
  }

  disconnect(): void {
    try {
      this.client.disconnect();
    } catch {
      // ignore cleanup errors
    }
  }

  onApplicationShutdown(): void {
    this.disconnect();
  }

  private userSocketsKey(userId: string): string {
    return `presence:user:${userId}:sockets`;
  }

  private socketUserKey(socketId: string): string {
    return `presence:socket:${socketId}`;
  }

  private safeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unknown error';
    }
    let message = error.message ?? 'Unknown error';
    // Never log Redis URLs or credentials.
    message = message.replaceAll(/rediss?:\/\/[^\s"']+/gi, '[REDACTED]');
    return message;
  }
}
