import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  ThrottlerModule,
  Throttle as NestThrottle,
  SkipThrottle,
} from '@nestjs/throttler';

export const StrictThrottle = (
  limit: number,
  ttlSeconds: number,
): MethodDecorator & ClassDecorator => {
  return NestThrottle({
    default: {
      limit,
      ttl: ttlSeconds * 1000,
    },
  });
};

@Module({})
export class RateLimitingModule {
  static forRoot(): DynamicModule {
    const enabled = process.env.THROTTLER_ENABLED !== 'false';

    const providers: Provider[] = [];
    if (enabled) {
      providers.push({
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      });
    }

    return {
      module: RateLimitingModule,
      imports: [
        ThrottlerModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const ttl = config.get<number>('THROTTLER_TTL_MS', 60000);
            const limit = config.get<number>('THROTTLER_LIMIT', 100);

            return {
              throttlers: [
                {
                  name: 'default',
                  ttl,
                  limit: enabled ? limit : Number.MAX_SAFE_INTEGER,
                },
              ],
            };
          },
        }),
      ],
      providers,
    };
  }
}

export { SkipThrottle };
