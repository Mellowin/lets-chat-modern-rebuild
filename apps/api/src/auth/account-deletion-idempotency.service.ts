import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@lets-chat/database';
import { RequestAccountDeletionResult } from './account-deletion.service';

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
 * persisted to PostgreSQL. A PostgreSQL advisory lock scoped to the user+key pair
 * makes the lookup-and-claim step atomic across multiple API instances, so only
 * one instance can execute the destructive operation for a given key at a time.
 * In-flight operations are deduplicated per instance via a promise map keyed by
 * the scoped key, so two different users sharing the same raw key can never share
 * a result and two requests with the same key but different bodies receive 409.
 */
@Injectable()
export class AccountDeletionIdempotencyService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionIdempotencyService.name);
  private readonly TTL_MS = 60 * 60 * 1000;
  private readonly PENDING_POLL_MS = 100;
  private readonly PENDING_POLL_MAX_ATTEMPTS = 300; // 30 seconds total
  private readonly PENDING_ABANDON_MS = 30_000;
  private readonly HEARTBEAT_INTERVAL_MS = 5_000;
  private readonly inFlight = new Map<
    string,
    {
      bodyHash: string;
      deferred: Deferred<RequestAccountDeletionResult>;
    }
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

  private generateClaimToken(): string {
    return randomUUID();
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

    const inFlight = this.inFlight.get(scopedKey);
    if (inFlight) {
      if (inFlight.bodyHash !== bodyHash) {
        return Promise.reject(
          new ConflictException(
            'Idempotency key reused with a different request',
          ),
        );
      }
      return inFlight.deferred.promise;
    }

    const deferred = new Deferred<RequestAccountDeletionResult>();
    this.inFlight.set(scopedKey, { bodyHash, deferred });

    void (async () => {
      try {
        const result = await this.executeWithLock(
          idempotencyKey,
          userId,
          bodyHash,
          operation,
        );
        deferred.resolve(result);
      } catch (error) {
        deferred.reject(error);
      } finally {
        this.inFlight.delete(scopedKey);
      }
    })();

    return deferred.promise;
  }

  private async executeWithLock(
    idempotencyKey: string,
    userId: string,
    bodyHash: string,
    operation: () => Promise<RequestAccountDeletionResult>,
  ): Promise<RequestAccountDeletionResult> {
    const expiresAt = new Date(Date.now() + this.TTL_MS);
    const lockInput = `${userId}:${idempotencyKey}`;
    const claimToken = this.generateClaimToken();

    for (let attempt = 0; attempt < this.PENDING_POLL_MAX_ATTEMPTS; attempt++) {
      const decision = await this.prisma.$transaction(
        async (tx) => {
          // Serialize all operations for this user+key pair across instances.
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            lockInput,
          );

          const existing = await tx.accountDeletionIdempotency.findUnique({
            where: {
              userId_idempotencyKey: {
                userId,
                idempotencyKey,
              },
            },
          });

          if (existing) {
            if (existing.bodyHash !== bodyHash) {
              return { type: 'mismatch' as const };
            }
            if (existing.status === 'COMPLETED') {
              return {
                type: 'completed' as const,
                scheduledFor: existing.scheduledFor,
              };
            }

            // PENDING row: reclaim it only if the previous owner is actually dead.
            // A live owner refreshes lastHeartbeatAt regularly, so we never
            // reclaim a row that still has a heartbeat.
            const abandonedBefore = new Date(
              Date.now() - this.PENDING_ABANDON_MS,
            );
            const heartbeatStale =
              !existing.lastHeartbeatAt ||
              existing.lastHeartbeatAt <= abandonedBefore;
            if (existing.createdAt <= abandonedBefore && heartbeatStale) {
              const claimed = await tx.accountDeletionIdempotency.updateMany({
                where: {
                  id: existing.id,
                  status: 'PENDING',
                  createdAt: { lte: abandonedBefore },
                  OR: [
                    { lastHeartbeatAt: null },
                    { lastHeartbeatAt: { lte: abandonedBefore } },
                  ],
                },
                data: {
                  claimToken,
                  lastHeartbeatAt: new Date(),
                  createdAt: new Date(),
                },
              });
              if (claimed.count > 0) {
                return { type: 'claimed' as const, claimToken };
              }
            }

            return { type: 'pending' as const };
          }

          // No row yet: claim the serialization point by creating a PENDING row.
          await tx.accountDeletionIdempotency.create({
            data: {
              userId,
              idempotencyKey,
              bodyHash,
              status: 'PENDING',
              scheduledFor: new Date(0),
              claimToken,
              lastHeartbeatAt: new Date(),
              expiresAt,
            },
          });
          return { type: 'claimed' as const, claimToken };
        },
        { maxWait: 10_000, timeout: 30_000 },
      );

      if (decision.type === 'mismatch') {
        throw new ConflictException(
          'Idempotency key reused with a different request',
        );
      }
      if (decision.type === 'completed') {
        return { scheduledFor: decision.scheduledFor };
      }
      if (decision.type === 'claimed') {
        const wrappedOperation = this.wrapOperationWithHeartbeat(
          userId,
          idempotencyKey,
          decision.claimToken,
          operation,
        );
        try {
          const result = await wrappedOperation();
          await this.complete(
            userId,
            idempotencyKey,
            decision.claimToken,
            result,
            expiresAt,
          );
          return result;
        } catch (error) {
          await this.abandon(userId, idempotencyKey, decision.claimToken);
          throw error;
        }
      }

      // Another instance owns the PENDING row and is still alive; wait for it.
      await new Promise((resolve) => setTimeout(resolve, this.PENDING_POLL_MS));
    }

    throw new ServiceUnavailableException(
      'Idempotency operation timed out waiting for another request',
    );
  }

  private wrapOperationWithHeartbeat(
    userId: string,
    idempotencyKey: string,
    claimToken: string,
    operation: () => Promise<RequestAccountDeletionResult>,
  ): () => Promise<RequestAccountDeletionResult> {
    return async () => {
      const heartbeat = setInterval(() => {
        void this.heartbeat(userId, idempotencyKey, claimToken);
      }, this.HEARTBEAT_INTERVAL_MS);

      try {
        return await operation();
      } finally {
        clearInterval(heartbeat);
      }
    };
  }

  private async heartbeat(
    userId: string,
    idempotencyKey: string,
    claimToken: string,
  ): Promise<void> {
    try {
      await this.prisma.accountDeletionIdempotency.updateMany({
        where: {
          userId,
          idempotencyKey,
          claimToken,
          status: 'PENDING',
        },
        data: {
          lastHeartbeatAt: new Date(),
          // Keep live PENDING rows alive as long as the owning request is still
          // running. cleanupExpired only removes rows whose expiresAt has passed.
          expiresAt: new Date(Date.now() + this.TTL_MS),
        },
      });
    } catch (error) {
      this.logger.warn(
        {
          userId,
          idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Idempotency heartbeat failed',
      );
    }
  }

  private async complete(
    userId: string,
    idempotencyKey: string,
    claimToken: string,
    result: RequestAccountDeletionResult,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.prisma.accountDeletionIdempotency.updateMany({
        where: {
          userId,
          idempotencyKey,
          claimToken,
          status: 'PENDING',
        },
        data: {
          status: 'COMPLETED',
          scheduledFor: result.scheduledFor,
          expiresAt,
          claimToken: null,
          lastHeartbeatAt: null,
        },
      });
    } catch (error) {
      this.logger.error(
        {
          userId,
          idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to mark idempotency row as completed',
      );
      throw error;
    }
  }

  private async abandon(
    userId: string,
    idempotencyKey: string,
    claimToken: string,
  ): Promise<void> {
    try {
      await this.prisma.accountDeletionIdempotency.deleteMany({
        where: {
          userId,
          idempotencyKey,
          claimToken,
          status: 'PENDING',
        },
      });
    } catch (error) {
      this.logger.warn(
        {
          userId,
          idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to abandon idempotency claim',
      );
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
