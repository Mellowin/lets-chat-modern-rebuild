import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { RequestAccountDeletionResult } from './account-deletion.service';

interface IdempotencyEntry {
  userId: string;
  idempotencyKey: string;
  bodyHash: string;
  scheduledFor: Date;
  expiresAt: Date;
}

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolveFn: (value: T) => void = () => undefined;
  private rejectFn: (reason: unknown) => void = () => undefined;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
  }

  resolve(value: T): void {
    this.resolveFn(value);
  }

  reject(reason: unknown): void {
    this.rejectFn(reason);
  }
}

/**
 * Durable idempotency store for account deletion requests.
 *
 * Each raw idempotency key is scoped to a concrete user + request body hash and
 * persisted to PostgreSQL. This survives API restarts and makes retries safe.
 * In-flight operations are deduplicated per instance via a promise map keyed by
 * the scoped key, so two different users sharing the same raw key can never
 * share a result.
 */
@Injectable()
export class AccountDeletionIdempotencyService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionIdempotencyService.name);
  private readonly TTL_MS = 60 * 60 * 1000;
  private readonly inFlight = new Map<
    string,
    Promise<RequestAccountDeletionResult>
  >();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {
    // Remove expired rows periodically. Bounded by TTL, not by request count.
    this.cleanupTimer = setInterval(
      () => {
        void this.cleanupExpired();
      },
      15 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  run(
    idempotencyKey: string,
    userId: string,
    bodyHash: string,
    operation: () => Promise<RequestAccountDeletionResult>,
  ): Promise<RequestAccountDeletionResult> {
    const scopedKey = `${userId}:${idempotencyKey}`;

    const inFlightPromise = this.inFlight.get(scopedKey);
    if (inFlightPromise) {
      return inFlightPromise;
    }

    // Register the in-flight promise synchronously so concurrent callers with the
    // same scoped key wait on the same result and are never accidentally deduplicated
    // with a different user.
    const deferred = new Deferred<RequestAccountDeletionResult>();
    this.inFlight.set(scopedKey, deferred.promise);

    void (async () => {
      try {
        const cached = await this.findValid(idempotencyKey, userId, bodyHash);
        if (cached === 'mismatch') {
          throw new ConflictException(
            'Idempotency key reused with a different request',
          );
        }
        if (cached) {
          deferred.resolve({ scheduledFor: cached.scheduledFor });
          return;
        }

        const result = await operation();
        await this.recordResult(idempotencyKey, userId, bodyHash, result);
        deferred.resolve(result);
      } catch (error) {
        deferred.reject(error);
      } finally {
        this.inFlight.delete(scopedKey);
      }
    })();

    return deferred.promise;
  }

  private async findValid(
    idempotencyKey: string,
    userId: string,
    bodyHash: string,
  ): Promise<IdempotencyEntry | 'mismatch' | null> {
    const entry = await this.prisma.accountDeletionIdempotency.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
    });

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= new Date()) {
      await this.prisma.accountDeletionIdempotency
        .delete({
          where: { id: entry.id },
        })
        .catch(() => {
          // Ignore concurrent deletion.
        });
      return null;
    }

    if (entry.bodyHash !== bodyHash) {
      return 'mismatch';
    }

    return entry;
  }

  private async recordResult(
    idempotencyKey: string,
    userId: string,
    bodyHash: string,
    result: RequestAccountDeletionResult,
  ): Promise<void> {
    try {
      await this.prisma.accountDeletionIdempotency.create({
        data: {
          userId,
          idempotencyKey,
          bodyHash,
          scheduledFor: result.scheduledFor,
          expiresAt: new Date(Date.now() + this.TTL_MS),
        },
      });
    } catch (error) {
      // Another instance won the race. The durable row is already stored,
      // so this is a safe no-op.
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return;
      }
      this.logger.error(
        {
          userId,
          idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to record idempotency result',
      );
      throw error;
    }
  }

  private async cleanupExpired(): Promise<void> {
    try {
      const result = await this.prisma.accountDeletionIdempotency.deleteMany({
        where: {
          expiresAt: {
            lte: new Date(),
          },
        },
      });
      if (result.count > 0) {
        this.logger.debug(`Deleted ${result.count} expired idempotency rows`);
      }
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Expired idempotency cleanup failed',
      );
    }
  }
}
