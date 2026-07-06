import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PresenceStore } from './presence-store.interface';
import { MemoryPresenceStore } from './memory-presence.store';
import { RedisPresenceStore } from './redis-presence.store';

export const PRESENCE_STORE = Symbol('PRESENCE_STORE');

export const presenceStoreProvider: Provider = {
  provide: PRESENCE_STORE,
  useFactory: (config: ConfigService): PresenceStore => {
    const logger = new Logger('PresenceStoreFactory');
    const url = config.get<string>('PRESENCE_REDIS_URL');

    if (!url) {
      return new MemoryPresenceStore();
    }

    try {
      const client = new Redis(url, {
        lazyConnect: true,
        connectionName: 'presence',
      });
      return new RedisPresenceStore(client);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { error: message },
        'Failed to create Redis presence store; falling back to memory store',
      );
      return new MemoryPresenceStore();
    }
  },
  inject: [ConfigService],
};
