/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { AccountDeletionIdempotencyService } from './account-deletion-idempotency.service';

describe('AccountDeletionIdempotencyService', () => {
  let service: AccountDeletionIdempotencyService;
  let prisma: {
    accountDeletionIdempotency: {
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      accountDeletionIdempotency: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn(),
      },
    };

    service = new AccountDeletionIdempotencyService(
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  function operation(scheduledFor: Date = new Date('2026-01-01T00:00:00Z')) {
    return jest.fn().mockResolvedValue({ scheduledFor });
  }

  function makeRow(
    bodyHash: string,
    expiresAt = new Date(Date.now() + 60 * 60 * 1000),
  ) {
    return {
      id: 'row-1',
      userId: 'user-1',
      idempotencyKey: 'key-1',
      bodyHash,
      scheduledFor: new Date('2026-01-01T00:00:00Z'),
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('runs the operation and returns the result on first call', async () => {
    const op = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).toHaveBeenCalledTimes(1);
    expect(prisma.accountDeletionIdempotency.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'key-1',
        bodyHash: 'body-1',
        scheduledFor: new Date('2026-01-01T00:00:00Z'),
      }),
    });
  });

  it('returns cached result for the same user and body without re-running', async () => {
    const op = operation();
    prisma.accountDeletionIdempotency.findUnique.mockResolvedValue(
      makeRow('body-1'),
    );

    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).not.toHaveBeenCalled();
  });

  it('does not share results between different users with the same raw key', async () => {
    prisma.accountDeletionIdempotency.findUnique.mockImplementation(
      (args: {
        where: {
          userId_idempotencyKey: { userId: string; idempotencyKey: string };
        };
      }) => {
        if (args.where.userId_idempotencyKey.userId === 'user-1') {
          return Promise.resolve(makeRow('body-1'));
        }
        return Promise.resolve(null);
      },
    );

    const opForUser1 = jest.fn().mockResolvedValue({
      scheduledFor: new Date('2026-01-01T00:00:00Z'),
    });
    const opForUser2 = jest.fn().mockResolvedValue({
      scheduledFor: new Date('2026-02-01T00:00:00Z'),
    });

    const first = await service.run('key-1', 'user-1', 'body-1', opForUser1);
    expect(first.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(opForUser1).not.toHaveBeenCalled();

    const second = await service.run('key-1', 'user-2', 'body-1', opForUser2);
    expect(second.scheduledFor).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(opForUser2).toHaveBeenCalledTimes(1);
  });

  it('rejects when the same key is reused with a different body', async () => {
    prisma.accountDeletionIdempotency.findUnique.mockResolvedValue(
      makeRow('body-1'),
    );

    await expect(
      service.run('key-1', 'user-1', 'body-2', jest.fn()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not cache results when the operation fails', async () => {
    prisma.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    const op = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(service.run('key-1', 'user-1', 'body-1', op)).rejects.toThrow(
      'boom',
    );

    expect(prisma.accountDeletionIdempotency.create).not.toHaveBeenCalled();

    const retryOp = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', retryOp);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(retryOp).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests with the same scoped key', async () => {
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

  it('does not deduplicate concurrent requests with the same raw key but different users', async () => {
    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { scheduledFor: new Date('2026-01-01T00:00:00Z') };
    });

    const [first, second] = await Promise.all([
      service.run('key-1', 'user-1', 'body-1', op),
      service.run('key-1', 'user-2', 'body-1', op),
    ]);

    expect(calls).toBe(2);
    expect(first).toEqual({ scheduledFor: new Date('2026-01-01T00:00:00Z') });
    expect(second).toEqual({ scheduledFor: new Date('2026-01-01T00:00:00Z') });
  });

  it('ignores duplicate-key errors when recording results', async () => {
    const op = operation();
    prisma.accountDeletionIdempotency.create.mockRejectedValue({
      code: 'P2002',
    });

    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('deletes expired rows on lookup', async () => {
    prisma.accountDeletionIdempotency.findUnique.mockResolvedValue(
      makeRow('body-1', new Date(Date.now() - 1000)),
    );

    const op = operation();
    await service.run('key-1', 'user-1', 'body-1', op);
    expect(prisma.accountDeletionIdempotency.delete).toHaveBeenCalledWith({
      where: { id: 'row-1' },
    });
  });

  it('cleans up expired rows on demand', async () => {
    prisma.accountDeletionIdempotency.deleteMany.mockResolvedValue({
      count: 3,
    });
    await (
      service as unknown as { cleanupExpired: () => Promise<void> }
    ).cleanupExpired();
    expect(prisma.accountDeletionIdempotency.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });
});
