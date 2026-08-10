import { ConflictException } from '@nestjs/common';
import { AccountDeletionIdempotencyService } from './account-deletion-idempotency.service';

describe('AccountDeletionIdempotencyService', () => {
  let service: AccountDeletionIdempotencyService;

  beforeEach(() => {
    service = new AccountDeletionIdempotencyService();
  });

  function operation(scheduledFor: Date = new Date('2026-01-01T00:00:00Z')) {
    return jest.fn().mockResolvedValue({ scheduledFor });
  }

  it('runs the operation and returns the result on first call', async () => {
    const op = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('returns cached result for the same user and body without re-running', async () => {
    const op = operation();
    await service.run('key-1', 'user-1', 'body-1', op);
    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('rejects when the same key is reused with a different user', async () => {
    const op = operation();
    await service.run('key-1', 'user-1', 'body-1', op);
    await expect(
      service.run('key-1', 'user-2', 'body-1', jest.fn()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the same key is reused with a different body', async () => {
    const op = operation();
    await service.run('key-1', 'user-1', 'body-1', op);
    await expect(
      service.run('key-1', 'user-1', 'body-2', jest.fn()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not cache results when the operation fails', async () => {
    const op = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(service.run('key-1', 'user-1', 'body-1', op)).rejects.toThrow(
      'boom',
    );

    const retryOp = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', retryOp);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(retryOp).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests with the same key', async () => {
    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { scheduledFor: new Date('2026-01-01T00:00:00Z') };
    });

    const [first, second] = await Promise.all([
      service.run('key-1', 'user-1', 'body-1', op),
      service.run('key-1', 'user-1', 'body-1', op),
    ]);

    expect(first).toEqual(second);
    expect(calls).toBe(1);
  });
});
