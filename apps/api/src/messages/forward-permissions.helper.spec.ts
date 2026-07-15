import { Test } from '@nestjs/testing';
import { PrismaService } from '@lets-chat/database';
import { ForwardPermissionsHelper } from './forward-permissions.helper';

describe('ForwardPermissionsHelper', () => {
  let helper: ForwardPermissionsHelper;
  let prisma: jest.Mocked<
    Pick<
      PrismaService,
      | 'channel'
      | 'channelMember'
      | 'workspaceMember'
      | 'directConversationParticipant'
      | 'groupMember'
    >
  >;

  const userId = '11111111-1111-1111-1111-111111111111';
  const groupId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    prisma = {
      channel: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      channelMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      workspaceMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      directConversationParticipant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      groupMember: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as typeof prisma;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ForwardPermissionsHelper,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    helper = moduleRef.get(ForwardPermissionsHelper);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('group source access', () => {
    it('allows active members of non-archived groups', async () => {
      (prisma.groupMember.findFirst as jest.Mock).mockResolvedValue({
        id: 'm1',
      });

      const result = await helper.canViewSource(userId, 'group', groupId);

      expect(result).toBe(true);
      expect(prisma.groupMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId, userId, leftAt: null, group: { archivedAt: null } },
        }),
      );
    });

    it('rejects sources from archived groups', async () => {
      (prisma.groupMember.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await helper.canViewSource(userId, 'group', groupId);

      expect(result).toBe(false);
    });

    it('rejects sources when the member has left', async () => {
      (prisma.groupMember.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await helper.canViewSource(userId, 'group', groupId);

      expect(result).toBe(false);
    });

    it('does not include archived groups in batched canViewSources', async () => {
      const activeGroupId = '33333333-3333-3333-3333-333333333333';
      (prisma.groupMember.findMany as jest.Mock).mockResolvedValue([
        { groupId: activeGroupId },
      ]);

      const result = await helper.canViewSources(userId, [
        { sourceType: 'group', sourceChatId: groupId },
        { sourceType: 'group', sourceChatId: activeGroupId },
      ]);

      expect(result).toEqual(new Set([`group:${activeGroupId}`]));
      expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            groupId: { in: [groupId, activeGroupId] },
            userId,
            leftAt: null,
            group: { archivedAt: null },
          },
          select: { groupId: true },
        }),
      );
    });

    it('returns anonymous metadata for archived group sources', async () => {
      (prisma.groupMember.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await helper.toResponse(
        {
          sourceType: 'group',
          sourceChatId: groupId,
          sourceMessageId: 'msg-1',
          originalAuthorId: 'u2',
          originalAuthorName: 'Bob',
          originalCreatedAt: '2024-01-01T00:00:00Z',
        },
        userId,
      );

      expect(result).toEqual({
        sourceType: 'group',
        originalCreatedAt: '2024-01-01T00:00:00Z',
        isAnonymous: true,
      });
      expect(result).not.toHaveProperty('sourceChatId');
      expect(result).not.toHaveProperty('sourceMessageId');
      expect(result).not.toHaveProperty('originalAuthorId');
      expect(result).not.toHaveProperty('originalAuthorName');
    });
  });
});
