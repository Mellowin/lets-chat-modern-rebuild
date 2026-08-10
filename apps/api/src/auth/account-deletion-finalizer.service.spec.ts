/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lets-chat/database';
import { AccountDeletionFinalizerService } from './account-deletion-finalizer.service';
import { AuditService } from '../audit/audit.service';

function createMockPrisma() {
  const state = {
    users: new Map<string, Record<string, unknown>>(),
    refreshTokens: [] as Array<{ userId: string }>,
    pushSubscriptions: [] as Array<{ userId: string }>,
    contacts: [] as Array<{ ownerUserId?: string; contactUserId?: string }>,
    contactRequests: [] as Array<{ fromUserId?: string; toUserId?: string }>,
    blocks: [] as Array<{ blockerId?: string; blockedId?: string }>,
    workspaceMembers: [] as Array<{ userId?: string; deletedAt?: Date | null }>,
    channelMembers: [] as Array<{ userId?: string; deletedAt?: Date | null }>,
    groupMembers: [] as Array<{ userId?: string; leftAt?: Date | null }>,
    attachments: [] as Array<{ createdById?: string; deletedAt?: Date | null }>,
  };

  const tx = {
    user: {
      updateMany: jest.fn(({ where, data }: { where: any; data: any }) => {
        const user = state.users.get(where.id);
        if (!user) return { count: 0 };
        if (user.status !== 'PENDING_DELETION') return { count: 0 };
        if (
          where.deletionScheduledFor?.lte &&
          user.deletionScheduledFor &&
          user.deletionScheduledFor > where.deletionScheduledFor.lte
        ) {
          return { count: 0 };
        }
        Object.assign(user, data, { status: 'ANONYMIZED' });
        return { count: 1 };
      }),
    },
    refreshToken: {
      deleteMany: jest.fn(({ where }: { where: any }) => {
        const before = state.refreshTokens.length;
        state.refreshTokens = state.refreshTokens.filter(
          (t) => t.userId !== where.userId,
        );
        return { count: before - state.refreshTokens.length };
      }),
    },
    pushSubscription: {
      deleteMany: jest.fn(({ where }: { where: any }) => {
        const before = state.pushSubscriptions.length;
        state.pushSubscriptions = state.pushSubscriptions.filter(
          (s) => s.userId !== where.userId,
        );
        return { count: before - state.pushSubscriptions.length };
      }),
    },
    userContact: {
      deleteMany: jest.fn(({ where }: { where: any }) => {
        const before = state.contacts.length;
        state.contacts = state.contacts.filter(
          (c) =>
            !(
              (where.OR[0].ownerUserId &&
                c.ownerUserId === where.OR[0].ownerUserId) ||
              (where.OR[1].contactUserId &&
                c.contactUserId === where.OR[1].contactUserId)
            ),
        );
        return { count: before - state.contacts.length };
      }),
    },
    contactRequest: {
      deleteMany: jest.fn(({ where }: { where: any }) => {
        const before = state.contactRequests.length;
        state.contactRequests = state.contactRequests.filter(
          (r) =>
            !(
              (where.OR[0].fromUserId &&
                r.fromUserId === where.OR[0].fromUserId) ||
              (where.OR[1].toUserId && r.toUserId === where.OR[1].toUserId)
            ),
        );
        return { count: before - state.contactRequests.length };
      }),
    },
    userBlock: {
      deleteMany: jest.fn(({ where }: { where: any }) => {
        const before = state.blocks.length;
        state.blocks = state.blocks.filter(
          (b) =>
            !(
              (where.OR[0].blockerId &&
                b.blockerId === where.OR[0].blockerId) ||
              (where.OR[1].blockedId && b.blockedId === where.OR[1].blockedId)
            ),
        );
        return { count: before - state.blocks.length };
      }),
    },
    workspaceMember: {
      updateMany: jest.fn(({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const m of state.workspaceMembers) {
          if (m.userId === where.userId && m.deletedAt == null) {
            m.deletedAt = data.deletedAt;
            count++;
          }
        }
        return { count };
      }),
    },
    channelMember: {
      updateMany: jest.fn(({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const m of state.channelMembers) {
          if (m.userId === where.userId && m.deletedAt == null) {
            m.deletedAt = data.deletedAt;
            count++;
          }
        }
        return { count };
      }),
    },
    groupMember: {
      updateMany: jest.fn(({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const m of state.groupMembers) {
          if (m.userId === where.userId && m.leftAt == null) {
            m.leftAt = data.leftAt;
            count++;
          }
        }
        return { count };
      }),
    },
    attachment: {
      updateMany: jest.fn(({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const a of state.attachments) {
          if (a.createdById === where.createdById && a.deletedAt == null) {
            a.deletedAt = data.deletedAt;
            count++;
          }
        }
        return { count };
      }),
    },
  };

  return {
    state,
    prisma: {
      user: {
        findMany: jest.fn(({ where }: { where: any }) => {
          return Array.from(state.users.values()).filter((u) => {
            if (where.status && u.status !== where.status) return false;
            if (
              where.deletionScheduledFor?.lte &&
              (!u.deletionScheduledFor ||
                u.deletionScheduledFor > where.deletionScheduledFor.lte)
            )
              return false;
            return true;
          });
        }),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any,
    tx,
  };
}

describe('AccountDeletionFinalizerService', () => {
  let service: AccountDeletionFinalizerService;
  let mock: ReturnType<typeof createMockPrisma>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    mock = createMockPrisma();
    auditService = { record: jest.fn().mockResolvedValue(undefined) } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountDeletionFinalizerService,
        {
          provide: PrismaService,
          useValue: mock.prisma,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(AccountDeletionFinalizerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when no users are due', async () => {
    const result = await service.run();
    expect(result.processedCount).toBe(0);
  });

  it('finalizes a pending user whose grace period has passed', async () => {
    const now = new Date();
    const userId = 'u1';
    mock.state.users.set(userId, {
      id: userId,
      status: 'PENDING_DELETION',
      deletionScheduledFor: new Date(now.getTime() - 1000),
    });
    mock.state.refreshTokens.push({ userId });
    mock.state.pushSubscriptions.push({ userId });
    mock.state.contacts.push({ ownerUserId: userId, contactUserId: 'other' });
    mock.state.workspaceMembers.push({ userId, deletedAt: null });
    mock.state.channelMembers.push({ userId, deletedAt: null });
    mock.state.groupMembers.push({ userId, leftAt: null });
    mock.state.attachments.push({ createdById: userId, deletedAt: null });

    const result = await service.run();

    expect(result.processedCount).toBe(1);
    const finalized = mock.state.users.get(userId);
    expect(finalized?.status).toBe('ANONYMIZED');
    expect(finalized?.deletedAt).toBeInstanceOf(Date);
    expect(mock.tx.refreshToken.deleteMany).toHaveBeenCalled();
    expect(mock.tx.pushSubscription.deleteMany).toHaveBeenCalled();
    expect(mock.tx.userContact.deleteMany).toHaveBeenCalled();
    expect(mock.tx.workspaceMember.updateMany).toHaveBeenCalled();
    expect(mock.tx.channelMember.updateMany).toHaveBeenCalled();
    expect(mock.tx.groupMember.updateMany).toHaveBeenCalled();
    expect(mock.tx.attachment.updateMany).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalled();
  });

  it('does not finalize a user before the scheduled date', async () => {
    const now = new Date();
    const userId = 'u1';
    mock.state.users.set(userId, {
      id: userId,
      status: 'PENDING_DELETION',
      deletionScheduledFor: new Date(now.getTime() + 10000),
    });

    const result = await service.run();

    expect(result.processedCount).toBe(0);
    expect(mock.state.users.get(userId)?.status).toBe('PENDING_DELETION');
  });

  it('is idempotent when run twice for the same user', async () => {
    const now = new Date();
    const userId = 'u1';
    mock.state.users.set(userId, {
      id: userId,
      status: 'PENDING_DELETION',
      deletionScheduledFor: new Date(now.getTime() - 1000),
    });

    await service.run();
    const first = mock.state.users.get(userId)?.anonymizedAt as Date;

    await service.run();

    expect(mock.state.users.get(userId)?.status).toBe('ANONYMIZED');
    expect(mock.state.users.get(userId)?.anonymizedAt).toEqual(first);
  });
});
