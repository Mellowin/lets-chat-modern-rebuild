import { ConflictException, Injectable } from '@nestjs/common';
import { RequestAccountDeletionResult } from './account-deletion.service';

interface IdempotencyEntry {
  userId: string;
  bodyHash: string;
  scheduledFor: Date;
  expiresAt: number;
}

/**
 * In-memory idempotency store for account deletion requests.
 *
 * The store is intentionally simple: it scopes each raw idempotency key to a
 * userId + request body hash, survives for a bounded TTL, and does not persist
 * raw tokens or passwords. Concurrent requests with the same key are deduplicated
 * by sharing the in-flight promise.
 */
@Injectable()
export class AccountDeletionIdempotencyService {
  private readonly TTL_MS = 60 * 60 * 1000;
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly inFlight = new Map<
    string,
    Promise<RequestAccountDeletionResult>
  >();

  async run(
    idempotencyKey: string,
    userId: string,
    bodyHash: string,
    operation: () => Promise<RequestAccountDeletionResult>,
  ): Promise<RequestAccountDeletionResult> {
    const inFlightPromise = this.inFlight.get(idempotencyKey);
    if (inFlightPromise) {
      return inFlightPromise;
    }

    const cached = this.get(idempotencyKey, userId, bodyHash);
    if (cached === 'mismatch') {
      throw new ConflictException(
        'Idempotency key reused with a different request',
      );
    }
    if (cached) {
      return { scheduledFor: cached };
    }

    const flight = operation().finally(() => {
      this.inFlight.delete(idempotencyKey);
    });
    this.inFlight.set(idempotencyKey, flight);

    const result = await flight;
    this.set(idempotencyKey, userId, bodyHash, result.scheduledFor);
    return result;
  }

  private get(
    key: string,
    userId: string,
    bodyHash: string,
  ): Date | 'mismatch' | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    if (entry.userId !== userId || entry.bodyHash !== bodyHash) {
      return 'mismatch';
    }
    return entry.scheduledFor;
  }

  private set(
    key: string,
    userId: string,
    bodyHash: string,
    scheduledFor: Date,
  ): void {
    this.entries.set(key, {
      userId,
      bodyHash,
      scheduledFor,
      expiresAt: Date.now() + this.TTL_MS,
    });
  }
}
