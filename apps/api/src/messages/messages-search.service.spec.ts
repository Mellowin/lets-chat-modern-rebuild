import { Test } from '@nestjs/testing';
import { MessagesSearchService } from './messages-search.service';
import { PrismaService } from '@lets-chat/database';
import { ChannelsService } from '../channels/channels.service';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';

describe('MessagesSearchService', () => {
  let service: MessagesSearchService;
  let prisma: jest.Mocked<
    Pick<
      PrismaService,
      '$queryRaw' | 'message' | 'directMessage' | 'groupMessage'
    >
  >;

  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      message: { findUnique: jest.fn() } as unknown as typeof prisma.message,
      directMessage: {
        findUnique: jest.fn(),
      } as unknown as typeof prisma.directMessage,
      groupMessage: {
        findUnique: jest.fn(),
      } as unknown as typeof prisma.groupMessage,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagesSearchService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ChannelsService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: WorkspacesRepository,
          useValue: {
            findMemberRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MessagesSearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function makeChannelResult(
    overrides?: Partial<NonNullable<unknown>>,
    channelType: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
  ) {
    return {
      id: 'msg-1',
      content: 'куку',
      contentSnippet: 'куку',
      createdAt: new Date('2024-01-02T00:00:00Z'),
      author: {
        id: 'u1',
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
      },
      sourceType: 'CHANNEL',
      source: {
        type: 'CHANNEL',
        workspaceId: 'ws-1',
        workspaceName: 'Workspace A',
        channelId: 'ch-1',
        channelName: 'general',
        channelSlug: 'general',
        channelType,
      },
      isPinned: false,
      ...overrides,
    };
  }

  function makeDirectResult(overrides?: Partial<NonNullable<unknown>>) {
    return {
      id: 'dm-1',
      content: 'привет',
      contentSnippet: 'привет',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      author: {
        id: 'u2',
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      },
      sourceType: 'DIRECT',
      source: {
        type: 'DIRECT',
        conversationId: 'conv-1',
        otherParticipant: {
          id: 'u2',
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
      },
      isPinned: false,
      ...overrides,
    };
  }

  function makeGroupResult(overrides?: Partial<NonNullable<unknown>>) {
    return {
      id: 'gm-1',
      content: 'група',
      contentSnippet: 'група',
      createdAt: new Date('2024-01-03T00:00:00Z'),
      author: {
        id: 'u3',
        username: 'carol',
        displayName: 'Carol',
        avatarUrl: null,
      },
      sourceType: 'GROUP',
      source: {
        type: 'GROUP',
        groupId: 'group-1',
        groupName: 'Project A',
      },
      isPinned: false,
      ...overrides,
    };
  }

  it('returns channel and direct results newest first', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult(),
      makeDirectResult(),
    ]);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].source.type).toBe('CHANNEL');
    expect(result.items[1].source.type).toBe('DIRECT');
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor when more results are available', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult({ id: 'msg-1' }),
      makeChannelResult({ id: 'msg-2' }),
      makeChannelResult({ id: 'msg-3' }),
    ]);

    const result = await service.searchGlobal(userId, {
      q: 'к',
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('msg-2');
  });

  it('resolves cursor from Message table', async () => {
    const cursorDate = new Date('2024-01-01T12:00:00Z');
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      createdAt: cursorDate,
    });
    (prisma.directMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.groupMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([makeChannelResult()]);

    await service.searchGlobal(userId, {
      q: 'к',
      cursor: 'msg-cursor',
    });

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'msg-cursor' },
      select: { createdAt: true },
    });
  });

  it('resolves cursor from DirectMessage table', async () => {
    const cursorDate = new Date('2024-01-01T12:00:00Z');
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.directMessage.findUnique as jest.Mock).mockResolvedValue({
      createdAt: cursorDate,
    });
    (prisma.groupMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([makeDirectResult()]);

    await service.searchGlobal(userId, {
      q: 'к',
      cursor: 'dm-cursor',
    });

    expect(prisma.directMessage.findUnique).toHaveBeenCalledWith({
      where: { id: 'dm-cursor' },
      select: { createdAt: true },
    });
  });

  it('resolves cursor from GroupMessage table', async () => {
    const cursorDate = new Date('2024-01-01T12:00:00Z');
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.directMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.groupMessage.findUnique as jest.Mock).mockResolvedValue({
      createdAt: cursorDate,
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([makeGroupResult()]);

    await service.searchGlobal(userId, {
      q: 'к',
      cursor: 'gm-cursor',
    });

    expect(prisma.groupMessage.findUnique).toHaveBeenCalledWith({
      where: { id: 'gm-cursor' },
      select: { createdAt: true },
    });
  });

  it('returns empty results when query yields nothing', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const result = await service.searchGlobal(userId, { q: 'z' });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('handles Cyrillic query "ку" without crashing', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult({ content: 'куку' }),
    ]);

    const result = await service.searchGlobal(userId, { q: 'ку' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('куку');
    expect(result.nextCursor).toBeNull();
  });

  it('maps mixed channel and direct sources correctly', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult({
        id: 'msg-a',
        source: {
          type: 'CHANNEL',
          workspaceId: 'ws-1',
          workspaceName: 'Workspace A',
          channelId: 'ch-1',
          channelName: 'general',
          channelSlug: 'general',
        },
      }),
      makeDirectResult({
        id: 'dm-a',
        source: {
          type: 'DIRECT',
          conversationId: 'conv-1',
          otherParticipant: {
            id: 'u2',
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: null,
          },
        },
      }),
    ]);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items[0].source.type).toBe('CHANNEL');
    expect(result.items[1].source.type).toBe('DIRECT');
    if (result.items[1].source.type === 'DIRECT') {
      expect(result.items[1].source.conversationId).toBe('conv-1');
      expect(result.items[1].source.otherParticipant?.username).toBe('bob');
    }
  });

  it('handles direct result with null otherParticipant', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeDirectResult({
        source: {
          type: 'DIRECT',
          conversationId: 'conv-self',
          otherParticipant: null,
        },
      }),
    ]);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.type).toBe('DIRECT');
    if (result.items[0].source.type === 'DIRECT') {
      expect(result.items[0].source.otherParticipant).toBeNull();
    }
  });

  it('ignores invalid cursor and returns first page', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.directMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.groupMessage.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([makeChannelResult()]);

    const result = await service.searchGlobal(userId, {
      q: 'к',
      cursor: 'missing-id',
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('includes channel visibility metadata for public channel results', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult({}, 'PUBLIC'),
    ]);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.type).toBe('CHANNEL');
    if (result.items[0].source.type === 'CHANNEL') {
      expect(result.items[0].source.channelType).toBe('PUBLIC');
    }
  });

  it('includes channel visibility metadata for private channel results', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult({}, 'PRIVATE'),
    ]);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.type).toBe('CHANNEL');
    if (result.items[0].source.type === 'CHANNEL') {
      expect(result.items[0].source.channelType).toBe('PRIVATE');
    }
  });

  it('returns private channel result only to users with access', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeChannelResult({ id: 'private-msg' }, 'PRIVATE'),
    ]);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('private-msg');
  });

  it('does not leak private channel results to non-members', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => []);

    const result = await service.searchGlobal(userId, { q: 'к' });

    expect(result.items).toEqual([]);
    const calls = (prisma.$queryRaw as jest.Mock).mock.calls as unknown[][];
    const queryArg = calls[0][0];
    const sqlText =
      typeof queryArg === 'string'
        ? queryArg
        : ((queryArg as { sql?: string }).sql ?? String(queryArg));
    expect(sqlText).toContain('accessible_channels');
    expect(sqlText).toContain('"ChannelMember"');
    expect(sqlText).toContain('channel_type');
  });

  it('includes group message results in global search', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      makeGroupResult(),
      makeChannelResult(),
      makeDirectResult(),
    ]);

    const result = await service.searchGlobal(userId, { q: 'г' });

    expect(result.items).toHaveLength(3);
    expect(result.items[0].source.type).toBe('GROUP');
    expect(result.items[1].source.type).toBe('CHANNEL');
    expect(result.items[2].source.type).toBe('DIRECT');
  });

  it('maps group source correctly', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([makeGroupResult()]);

    const result = await service.searchGlobal(userId, { q: 'г' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.type).toBe('GROUP');
    if (result.items[0].source.type === 'GROUP') {
      expect(result.items[0].source.groupId).toBe('group-1');
      expect(result.items[0].source.groupName).toBe('Project A');
    }
  });

  it('limits channel scope to accessible_groups CTE', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => []);

    await service.searchGlobal(userId, { q: 'г', scope: 'group' });

    const calls = (prisma.$queryRaw as jest.Mock).mock.calls as unknown[][];
    const queryArg = calls[0][0];
    const sqlText =
      typeof queryArg === 'string'
        ? queryArg
        : ((queryArg as { sql?: string }).sql ?? String(queryArg));
    expect(sqlText).toContain('accessible_groups');
    expect(sqlText).toContain('"GroupMessage"');
  });

  it('applies workspaceId filter to channel scope', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(() => []);

    await service.searchGlobal(userId, {
      q: 'г',
      scope: 'channel',
      workspaceId: 'ws-filter',
    });

    const calls = (prisma.$queryRaw as jest.Mock).mock.calls as unknown[][];
    const queryArg = calls[0][0];
    const sqlText =
      typeof queryArg === 'string'
        ? queryArg
        : ((queryArg as { sql?: string }).sql ?? String(queryArg));
    expect(sqlText).toContain('accessible_channels');
    expect(sqlText).toContain('FROM "Message"');
    expect(sqlText).toContain('AND FALSE');
  });
});
