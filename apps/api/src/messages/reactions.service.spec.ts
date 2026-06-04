import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReactionsService } from './reactions.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { ReactionsRepository } from './reactions.repository';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';

describe('ReactionsService', () => {
  let service: ReactionsService;
  let channelsService: jest.Mocked<ChannelsService>;
  let messagesRepository: jest.Mocked<MessagesRepository>;
  let reactionsRepository: jest.Mocked<ReactionsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let websocketEvents: jest.Mocked<WebsocketEventsService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const workspaceId = '33333333-3333-3333-3333-333333333333';
  const channelId = '44444444-4444-4444-4444-444444444444';
  const messageId = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReactionsService,
        {
          provide: ChannelsService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: MessagesRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: ReactionsRepository,
          useValue: {
            findActiveByUser: jest.fn(),
            findActive: jest.fn(),
            create: jest.fn(),
            softDelete: jest.fn(),
            softDeleteMany: jest.fn(),
            listWithCounts: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: WebsocketEventsService,
          useValue: {
            broadcastReactionAdded: jest.fn(),
            broadcastReactionRemoved: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ReactionsService);
    channelsService = moduleRef.get(ChannelsService);
    messagesRepository = moduleRef.get(MessagesRepository);
    reactionsRepository = moduleRef.get(ReactionsRepository);
    usersRepository = moduleRef.get(UsersRepository);
    websocketEvents = moduleRef.get(WebsocketEventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockChannelAccess() {
    channelsService.findById.mockResolvedValue({
      id: channelId,
      workspaceId,
    } as Awaited<ReturnType<ChannelsService['findById']>>);
  }

  function mockMessage(overrides: { channelId?: string; deletedAt?: Date | null } = {}) {
    messagesRepository.findById.mockResolvedValue({
      id: messageId,
      channelId: overrides.channelId ?? channelId,
      deletedAt: overrides.deletedAt ?? null,
    } as Awaited<ReturnType<MessagesRepository['findById']>>);
  }

  describe('addReaction', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Workspace not found'),
      );

      await expect(
        service.addReaction(workspaceId, channelId, messageId, { emoji: '👍' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for non-channel member', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await expect(
        service.addReaction(workspaceId, channelId, messageId, { emoji: '👍' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for message from another channel', async () => {
      mockChannelAccess();
      mockMessage({ channelId: '99999999-9999-9999-9999-999999999999' });

      await expect(
        service.addReaction(workspaceId, channelId, messageId, { emoji: '👍' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for deleted message', async () => {
      mockChannelAccess();
      mockMessage({ deletedAt: new Date() });

      await expect(
        service.addReaction(workspaceId, channelId, messageId, { emoji: '👍' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('adds new reaction when user has none', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActiveByUser.mockResolvedValue([]);
      reactionsRepository.create.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
      });
      reactionsRepository.listWithCounts.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      const result = await service.addReaction(
        workspaceId,
        channelId,
        messageId,
        { emoji: '👍' },
        userId,
      );

      expect(result).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
      expect(reactionsRepository.create).toHaveBeenCalledWith({
        messageId,
        userId,
        emoji: '👍',
      });
      expect(websocketEvents.broadcastReactionAdded).toHaveBeenCalled();
    });

    it('toggles off same emoji', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActiveByUser.mockResolvedValue([
        { id: 'r1', messageId, userId, emoji: '👍', deletedAt: null },
      ]);
      reactionsRepository.softDelete.mockResolvedValue({
        id: 'r1',
        deletedAt: new Date(),
      });
      reactionsRepository.listWithCounts.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      const result = await service.addReaction(
        workspaceId,
        channelId,
        messageId,
        { emoji: '👍' },
        userId,
      );

      expect(reactionsRepository.softDelete).toHaveBeenCalledWith('r1');
      expect(reactionsRepository.create).not.toHaveBeenCalled();
      expect(websocketEvents.broadcastReactionRemoved).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('replaces different emoji with new one', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActiveByUser.mockResolvedValue([
        { id: 'r1', messageId, userId, emoji: '❤️', deletedAt: null },
      ]);
      reactionsRepository.deleteDirectReactionsForUser = jest.fn().mockResolvedValue({ count: 1 });
      reactionsRepository.create.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '👍',
      });
      reactionsRepository.listWithCounts.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      const result = await service.addReaction(
        workspaceId,
        channelId,
        messageId,
        { emoji: '👍' },
        userId,
      );

      expect(reactionsRepository.softDeleteMany).toHaveBeenCalledWith(['r1']);
      expect(reactionsRepository.create).toHaveBeenCalledWith({
        messageId,
        userId,
        emoji: '👍',
      });
      expect(websocketEvents.broadcastReactionAdded).toHaveBeenCalled();
      expect(result).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
    });

    it('enforces one reaction per user', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActiveByUser.mockResolvedValue([
        { id: 'r1', messageId, userId, emoji: '❤️', deletedAt: null },
      ]);
      reactionsRepository.create.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '👍',
      });
      reactionsRepository.listWithCounts.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      await service.addReaction(
        workspaceId,
        channelId,
        messageId,
        { emoji: '👍' },
        userId,
      );

      expect(reactionsRepository.softDeleteMany).toHaveBeenCalledWith(['r1']);
    });

    it('preserves other users reactions when replacing', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActiveByUser.mockResolvedValue([
        { id: 'r1', messageId, userId, emoji: '❤️', deletedAt: null },
      ]);
      reactionsRepository.create.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '👍',
      });
      reactionsRepository.listWithCounts.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: true },
        { emoji: '❤️', count: 1, reactedByMe: false },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      const result = await service.addReaction(
        workspaceId,
        channelId,
        messageId,
        { emoji: '👍' },
        userId,
      );

      expect(result).toContainEqual({ emoji: '❤️', count: 1, reactedByMe: false });
    });
  });

  describe('removeReaction', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Workspace not found'),
      );

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, '👍', userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for non-channel member', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, '👍', userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for message from another channel', async () => {
      mockChannelAccess();
      mockMessage({ channelId: '99999999-9999-9999-9999-999999999999' });

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, '👍', userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for deleted message', async () => {
      mockChannelAccess();
      mockMessage({ deletedAt: new Date() });

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, '👍', userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes existing reaction', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActive.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        deletedAt: null,
      });
      reactionsRepository.softDelete.mockResolvedValue({
        id: 'r1',
        deletedAt: new Date(),
      });
      reactionsRepository.listWithCounts.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      const result = await service.removeReaction(
        workspaceId,
        channelId,
        messageId,
        '👍',
        userId,
      );

      expect(reactionsRepository.softDelete).toHaveBeenCalledWith('r1');
      expect(websocketEvents.broadcastReactionRemoved).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('throws NotFoundException when reaction does not exist', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActive.mockResolvedValue(null);

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, '👍', userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reactionsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid emoji', async () => {
      mockChannelAccess();
      mockMessage();

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, '', userId),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.removeReaction(workspaceId, channelId, messageId, 'x'.repeat(33), userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only removes reaction scoped to current user', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.findActive.mockImplementation(
        async (_msgId: string, uId: string, _emoji: string) => {
          if (uId === userId) {
            return { id: 'r1', messageId, userId, emoji: '👍', deletedAt: null };
          }
          return null;
        },
      );
      reactionsRepository.softDelete.mockResolvedValue({
        id: 'r1',
        deletedAt: new Date(),
      });
      reactionsRepository.listWithCounts.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      await service.removeReaction(workspaceId, channelId, messageId, '👍', userId);

      expect(reactionsRepository.findActive).toHaveBeenCalledWith(
        messageId,
        userId,
        '👍',
      );
      expect(reactionsRepository.softDelete).toHaveBeenCalledWith('r1');
    });
  });

  describe('listReactions', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Workspace not found'),
      );

      await expect(
        service.listReactions(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for non-channel member', async () => {
      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await expect(
        service.listReactions(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for message from another channel', async () => {
      mockChannelAccess();
      mockMessage({ channelId: '99999999-9999-9999-9999-999999999999' });

      await expect(
        service.listReactions(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for deleted message', async () => {
      mockChannelAccess();
      mockMessage({ deletedAt: new Date() });

      await expect(
        service.listReactions(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns reaction summary', async () => {
      mockChannelAccess();
      mockMessage();
      reactionsRepository.listWithCounts.mockResolvedValue([
        { emoji: '👍', count: 2, reactedByMe: true },
        { emoji: '❤️', count: 1, reactedByMe: false },
      ]);

      const result = await service.listReactions(
        workspaceId,
        channelId,
        messageId,
        userId,
      );

      expect(result).toEqual([
        { emoji: '👍', count: 2, reactedByMe: true },
        { emoji: '❤️', count: 1, reactedByMe: false },
      ]);
      expect(reactionsRepository.listWithCounts).toHaveBeenCalledWith(
        messageId,
        userId,
      );
    });
  });
});
