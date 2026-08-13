/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { AccountDeletionIdempotencyService } from './account-deletion-idempotency.service';

describe('AccountDeletionIdempotencyService', () => {
  let service: AccountDeletionIdempotencyService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    accountDeletionIdempotency: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let tx: {
    $executeRawUnsafe: jest.Mock;
    accountDeletionIdempotency: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      accountDeletionIdempotency: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
      $executeRawUnsafe: jest.fn(),
      accountDeletionIdempotency: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
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
    status: 'PENDING' | 'COMPLETED' = 'COMPLETED',
    expiresAt = new Date(Date.now() + 60 * 60 * 1000),
  ) {
    return {
      id: 'row-1',
      userId: 'user-1',
      idempotencyKey: 'key-1',
      bodyHash,
      status,
      scheduledFor: new Date('2026-01-01T00:00:00Z'),
      claimToken: status === 'PENDING' ? 'claim-1' : null,
      lastHeartbeatAt: status === 'PENDING' ? new Date() : null,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('runs the operation and returns the result on first call', async () => {
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.updateMany.mockResolvedValue({ count: 1 });

    const op = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).toHaveBeenCalledTimes(1);
    expect(tx.accountDeletionIdempotency.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'key-1',
        bodyHash: 'body-1',
        status: 'PENDING',
        claimToken: expect.any(String),
        lastHeartbeatAt: expect.any(Date),
      }),
    });
    expect(prisma.accountDeletionIdempotency.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'key-1',
        status: 'PENDING',
      }),
      data: expect.objectContaining({
        status: 'COMPLETED',
        scheduledFor: new Date('2026-01-01T00:00:00Z'),
        claimToken: null,
        lastHeartbeatAt: null,
      }),
    });
  });

  it('returns cached result for the same user and body without re-running', async () => {
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(
      makeRow('body-1'),
    );

    const op = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).not.toHaveBeenCalled();
  });

  it('does not share results between different users with the same raw key', async () => {
    tx.accountDeletionIdempotency.findUnique.mockImplementation(
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
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.update.mockResolvedValue(undefined);

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
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(
      makeRow('body-1'),
    );

    await expect(
      service.run('key-1', 'user-1', 'body-2', jest.fn()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('extends the expiresAt of a PENDING row with each heartbeat', async () => {
    await (
      service as unknown as { heartbeat: (...args: unknown[]) => Promise<void> }
    ).heartbeat('user-1', 'key-1', 'claim-1');

    expect(prisma.accountDeletionIdempotency.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'key-1',
        claimToken: 'claim-1',
        status: 'PENDING',
      }),
      data: expect.objectContaining({
        lastHeartbeatAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('does not delete a live PENDING row during expiry cleanup', async () => {
    prisma.accountDeletionIdempotency.deleteMany.mockResolvedValue({
      count: 0,
    });

    await (
      service as unknown as { cleanupExpired: () => Promise<void> }
    ).cleanupExpired();

    expect(
      prisma.accountDeletionIdempotency.deleteMany,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('does not cache results when the operation fails', async () => {
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.deleteMany.mockResolvedValue({ count: 1 });

    const op = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(service.run('key-1', 'user-1', 'body-1', op)).rejects.toThrow(
      'boom',
    );

    expect(tx.accountDeletionIdempotency.create).toHaveBeenCalled();
    expect(prisma.accountDeletionIdempotency.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        idempotencyKey: 'key-1',
        status: 'PENDING',
      }),
    });
  });

  it('deduplicates concurrent requests with the same scoped key', async () => {
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.updateMany.mockResolvedValue({ count: 1 });

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

  it('returns 409 when concurrent requests share the same scoped key but have different bodies', async () => {
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.updateMany.mockResolvedValue({ count: 1 });

    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { scheduledFor: new Date('2026-01-01T00:00:00Z') };
    });

    const [first, second] = await Promise.allSettled([
      service.run('key-1', 'user-1', 'body-1', op),
      service.run('key-1', 'user-1', 'body-2', op),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') {
      expect(second.reason).toBeInstanceOf(ConflictException);
    }
    expect(calls).toBe(1);
  });

  it('abandons a PENDING claim on operation failure so retries can proceed', async () => {
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.deleteMany.mockResolvedValue({ count: 1 });

    const op = jest.fn().mockRejectedValue(new Error('transient'));
    await expect(service.run('key-1', 'user-1', 'body-1', op)).rejects.toThrow(
      'transient',
    );

    // Simulate a retry from another instance: the PENDING row should have been
    // removed, so the retry is allowed to create a new claim.
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue(null);
    tx.accountDeletionIdempotency.create.mockResolvedValue(undefined);
    tx.accountDeletionIdempotency.updateMany.mockResolvedValue({ count: 1 });

    const retryOp = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', retryOp);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(retryOp).toHaveBeenCalledTimes(1);
  });

  it('acquires an abandoned PENDING row and completes the operation', async () => {
    const oldCreatedAt = new Date(Date.now() - 60_000);
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue({
      ...makeRow('body-1', 'PENDING'),
      createdAt: oldCreatedAt,
      lastHeartbeatAt: new Date(Date.now() - 60_000),
    });
    tx.accountDeletionIdempotency.updateMany.mockResolvedValue({ count: 1 });

    const op = operation();
    const result = await service.run('key-1', 'user-1', 'body-1', op);
    expect(result.scheduledFor).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(op).toHaveBeenCalledTimes(1);
    expect(tx.accountDeletionIdempotency.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'row-1',
        status: 'PENDING',
        createdAt: { lte: expect.any(Date) },
      }),
      data: expect.objectContaining({
        claimToken: expect.any(String),
        lastHeartbeatAt: expect.any(Date),
        createdAt: expect.any(Date),
      }),
    });
  });

  it('does not reclaim a PENDING row that still has a fresh heartbeat', async () => {
    const oldCreatedAt = new Date(Date.now() - 60_000);
    tx.accountDeletionIdempotency.findUnique.mockResolvedValue({
      ...makeRow('body-1', 'PENDING'),
      createdAt: oldCreatedAt,
      lastHeartbeatAt: new Date(),
    });

    const op = jest.fn().mockResolvedValue({
      scheduledFor: new Date('2026-01-01T00:00:00Z'),
    });

    // Shorten the polling loop so the test finishes quickly.
    (
      service as unknown as { PENDING_POLL_MAX_ATTEMPTS: number }
    ).PENDING_POLL_MAX_ATTEMPTS = 1;

    await expect(
      service.run('key-1', 'user-1', 'body-1', op),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(op).not.toHaveBeenCalled();
  });
});
