/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { PrismaService } from '@lets-chat/database';
import { DataExportService } from './data-export.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
    channelMember: { findMany: jest.fn().mockResolvedValue([]) },
    groupMember: { findMany: jest.fn().mockResolvedValue([]) },
    workspace: { findMany: jest.fn().mockResolvedValue([]) },
    channel: { findMany: jest.fn().mockResolvedValue([]) },
    groupConversation: { findMany: jest.fn().mockResolvedValue([]) },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    directMessageReaction: { findMany: jest.fn().mockResolvedValue([]) },
    pinnedChannelMessage: { findMany: jest.fn().mockResolvedValue([]) },
    pinnedDirectMessage: { findMany: jest.fn().mockResolvedValue([]) },
    pinnedGroupMessage: { findMany: jest.fn().mockResolvedValue([]) },
    userContact: { findMany: jest.fn().mockResolvedValue([]) },
    userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    userReport: { findMany: jest.fn().mockResolvedValue([]) },
    attachment: { findMany: jest.fn().mockResolvedValue([]) },
    refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
    message: { findMany: jest.fn().mockResolvedValue([]) },
    directMessage: { findMany: jest.fn().mockResolvedValue([]) },
    groupMessage: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('DataExportService', () => {
  let service: DataExportService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let passwordService: jest.Mocked<PasswordService>;
  let auditService: jest.Mocked<AuditService>;
  let res: Partial<Response>;
  let chunks: string[];

  const userId = '11111111-1111-1111-1111-111111111111';

  function makeUser() {
    return {
      id: userId,
      email: 'user@example.com',
      username: 'user',
      passwordHash: 'hash',
      displayName: null,
      avatarUrl: null,
      interfaceLanguage: 'en',
      role: 'USER',
      contactPrivacySetting: 'EVERYONE',
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();
    passwordService = { verifyPassword: jest.fn() } as any;
    auditService = { record: jest.fn().mockResolvedValue(undefined) } as any;

    chunks = [];
    res = {
      setHeader: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      write: jest
        .fn()
        .mockImplementation(
          (
            chunk: string | Buffer,
            _encoding?: string | (() => void),
            cb?: () => void,
          ) => {
            if (typeof chunk === 'string') {
              chunks.push(chunk);
            } else if (Buffer.isBuffer(chunk)) {
              chunks.push(chunk.toString('utf8'));
            }
            if (typeof cb === 'function') cb();
            return true;
          },
        ),
      end: jest.fn().mockImplementation((cb?: () => void) => {
        if (typeof cb === 'function') cb();
      }),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DataExportService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: PasswordService,
          useValue: passwordService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = moduleRef.get(DataExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function parseStreamedExport(): Record<string, unknown> {
    return JSON.parse(chunks.join(''));
  }

  it('rejects export when user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.exportUserData(userId, 'password', res as Response),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects export when password is invalid', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser() as any);
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.exportUserData(userId, 'wrongpassword', res as Response),
    ).rejects.toBeInstanceOf(Error);
  });

  it('streams JSON export and excludes secrets', async () => {
    const user = makeUser();
    prisma.user.findUnique.mockResolvedValue(user as any);
    passwordService.verifyPassword.mockResolvedValue(true);
    prisma.userReport.findMany.mockResolvedValue([
      {
        id: 'r1',
        reporterId: userId,
        reason: 'spam',
        details: 'annoying',
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    await service.exportUserData(userId, 'password', res as Response);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json; charset=utf-8',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate',
    );
    expect(res.end).toHaveBeenCalled();

    const payload = parseStreamedExport();
    expect(payload.exportFormatVersion).toBe('1.0.0');
    expect(payload.profile).toBeDefined();
    expect(
      (payload.profile as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
    expect(
      (payload.profile as Record<string, unknown>).emailVerificationTokenHash,
    ).toBeUndefined();
    expect(payload.reports).toHaveLength(1);
    expect(auditService.record).toHaveBeenCalled();
  });

  it('streams more than 10000 channel messages without truncation', async () => {
    const total = 10_001;
    const user = makeUser();
    prisma.user.findUnique.mockResolvedValue(user as any);
    passwordService.verifyPassword.mockResolvedValue(true);

    prisma.message.findMany.mockImplementation((args: any) => {
      const cursor = args.cursor?.id ?? args.where?.id?.gt ?? null;
      const take = args.take ?? 1000;
      let start = 0;
      if (cursor) {
        const cursorNum = parseInt(cursor.split('-')[0], 10);
        start = cursorNum + 1;
      }
      const batch: Array<{ id: string; channelId: string; content: string }> =
        [];
      for (let i = start; i < Math.min(start + take, total); i++) {
        batch.push({
          id: `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`,
          channelId: '00000000-0000-0000-0000-000000000001',
          content: `message ${i}`,
        });
      }
      return Promise.resolve(batch);
    });

    await service.exportUserData(userId, 'password', res as Response);

    const payload = parseStreamedExport();
    expect(Array.isArray(payload.messages)).toBe(true);
    expect((payload.messages as unknown[]).length).toBe(total);
  });
});
