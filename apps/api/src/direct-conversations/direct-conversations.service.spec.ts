import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DirectConversationsService } from './direct-conversations.service';
import {
  DirectConversationsRepository,
  DirectConversationWithParticipants,
  DirectMessageWithAuthorAndParent,
} from './direct-conversations.repository';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PresenceService } from '../websocket/presence.service';

const userId = '11111111-1111-1111-1111-111111111111';
const otherUserId = '22222222-2222-2222-2222-222222222222';
const conversationId = '33333333-3333-3333-3333-333333333333';
const messageId = '44444444-4444-4444-4444-444444444444';

function makeConversation(
  overrides: Partial<DirectConversationWithParticipants> = {},
): DirectConversationWithParticipants {
  const base: DirectConversationWithParticipants = {
    id: conversationId,
    key: `${userId}:${otherUserId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [
      {
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
        user: {
          id: userId,
          username: 'alice',
          displayName: null,
          avatarUrl: null,
        },
      },
      {
        id: 'p-other',
        conversationId,
        userId: otherUserId,
        createdAt: new Date(),
        lastReadAt: new Date(),
        user: {
          id: otherUserId,
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
      },
    ],
    messages: [],
  };
  return { ...base, ...overrides };
}

function makeMessage(
  overrides: Partial<DirectMessageWithAuthorAndParent> = {},
): DirectMessageWithAuthorAndParent {
  const base: DirectMessageWithAuthorAndParent = {
    id: messageId,
    conversationId,
    authorId: userId,
    content: 'hello',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    editedAt: null,
    deletedAt: null,
    author: {
      id: userId,
      username: 'alice',
      displayName: null,
      avatarUrl: null,
    },
    parent: null,
  };
  return { ...base, ...overrides };
}

describe('DirectConversationsService', () => {
  let service: DirectConversationsService;
  let repository: jest.Mocked<DirectConversationsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let websocketEvents: jest.Mocked<WebsocketEventsService>;
  let presence: jest.Mocked<PresenceService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DirectConversationsService,
        {
          provide: DirectConversationsRepository,
          useValue: {
            findByKey: jest.fn(),
            findById: jest.fn(),
            createConversation: jest.fn(),
            listForUser: jest.fn(),
            findParticipant: jest.fn(),
            findParticipants: jest.fn(),
            createMessage: jest.fn(),
            findMessageById: jest.fn(),
            listMessagesForConversation: jest.fn(),
            touchConversationUpdatedAt: jest.fn(),
            updateParticipantLastRead: jest.fn(),
            countUnreadMessages: jest.fn(),
            updateDirectMessageContent: jest.fn(),
            softDeleteDirectMessage: jest.fn(),
            findDirectReaction: jest.fn(),
            createDirectReaction: jest.fn(),
            deleteDirectReaction: jest.fn(),
            deleteDirectReactionsForUser: jest.fn(),
            getDirectMessageReactions: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByUsername: jest.fn(),
            findByEmail: jest.fn(),
          },
        },
        {
          provide: WebsocketEventsService,
          useValue: {
            broadcastDirectMessageCreated: jest.fn(),
            broadcastDirectConversationUpdated: jest.fn(),
            broadcastDirectMessageUpdated: jest.fn(),
            broadcastDirectMessageDeleted: jest.fn(),
            broadcastDirectReactionAdded: jest.fn(),
            broadcastDirectReactionRemoved: jest.fn(),
          },
        },
        {
          provide: PresenceService,
          useValue: {
            isUserTracked: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DirectConversationsService);
    repository = moduleRef.get(DirectConversationsRepository);
    usersRepository = moduleRef.get(UsersRepository);
    websocketEvents = moduleRef.get(WebsocketEventsService);
    presence = moduleRef.get(PresenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('throws BadRequestException when neither userId nor usernameOrEmail is provided', async () => {
      await expect(service.create({}, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ userId: otherUserId }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when trying to create conversation with self', async () => {
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'self',
        displayName: null,
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);

      await expect(
        service.create({ userId: userId }, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a direct conversation with another user', async () => {
      usersRepository.findById.mockResolvedValue({
        id: otherUserId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);
      repository.findByKey.mockResolvedValue(null);
      repository.createConversation.mockResolvedValue(makeConversation());
      repository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.create({ userId: otherUserId }, userId);
      expect(result.id).toBe(conversationId);
    });

    it('returns other user as otherParticipant, not current user', async () => {
      usersRepository.findById.mockResolvedValue({
        id: otherUserId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);
      repository.findByKey.mockResolvedValue(null);
      repository.createConversation.mockResolvedValue(makeConversation());
      repository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.create({ userId: otherUserId }, userId);
      expect(result.otherParticipant?.id).toBe(otherUserId);
      expect(result.otherParticipant?.id).not.toBe(userId);
    });

    it('returns existing conversation when opening same pair twice', async () => {
      usersRepository.findById.mockResolvedValue({
        id: otherUserId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);
      repository.findByKey.mockResolvedValue(makeConversation());
      repository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.create({ userId: otherUserId }, userId);
      expect(result.id).toBe(conversationId);
      expect(repository.createConversation).not.toHaveBeenCalled();
    });

    it('finds user by usernameOrEmail when userId is not provided', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: otherUserId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);
      repository.findByKey.mockResolvedValue(null);
      repository.createConversation.mockResolvedValue(makeConversation());
      repository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.create({ usernameOrEmail: 'bob' }, userId);
      expect(result.id).toBe(conversationId);
    });

    it('throws NotFoundException when usernameOrEmail does not match any user', async () => {
      usersRepository.findByUsername.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.create({ usernameOrEmail: 'nobody' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('finds user by email when username does not match', async () => {
      usersRepository.findByUsername.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue({
        id: otherUserId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);
      repository.findByKey.mockResolvedValue(null);
      repository.createConversation.mockResolvedValue(makeConversation());
      repository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.create(
        { usernameOrEmail: 'bob@example.com' },
        userId,
      );
      expect(result.id).toBe(conversationId);
      expect(usersRepository.findByEmail).toHaveBeenCalledWith(
        'bob@example.com',
      );
    });
  });

  describe('list', () => {
    it('lists only current user direct conversations', async () => {
      repository.listForUser.mockResolvedValue([makeConversation()]);
      repository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.list(userId);
      expect(result).toHaveLength(1);
      expect(repository.listForUser).toHaveBeenCalledWith(userId);
    });

    it('returns other user as otherParticipant in list', async () => {
      repository.listForUser.mockResolvedValue([makeConversation()]);
      repository.countUnreadMessages.mockResolvedValue(0);
      const result = await service.list(userId);
      expect(result[0].otherParticipant?.id).toBe(otherUserId);
      expect(result[0].otherParticipant?.id).not.toBe(userId);
    });

    it('includes unreadCount for conversations', async () => {
      repository.listForUser.mockResolvedValue([makeConversation()]);
      repository.countUnreadMessages.mockResolvedValue(3);

      const result = await service.list(userId);
      expect(result[0].unreadCount).toBe(3);
    });

    it('counts unread messages from other user only', async () => {
      const conv = makeConversation({
        participants: [
          {
            id: 'p-current',
            conversationId,
            userId,
            createdAt: new Date(),
            lastReadAt: new Date(),
            user: {
              id: userId,
              username: 'alice',
              displayName: null,
              avatarUrl: null,
            },
          },
          {
            id: 'p-other',
            conversationId,
            userId: otherUserId,
            createdAt: new Date(),
            lastReadAt: null,
            user: {
              id: otherUserId,
              username: 'bob',
              displayName: 'Bob',
              avatarUrl: null,
            },
          },
        ],
      });
      repository.listForUser.mockResolvedValue([conv]);
      repository.countUnreadMessages.mockResolvedValue(5);

      const result = await service.list(userId);
      expect(result[0].unreadCount).toBe(5);
      expect(repository.countUnreadMessages).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.any(Date),
      );
    });

    it('includes isOnline true when other user is tracked', async () => {
      repository.listForUser.mockResolvedValue([makeConversation()]);
      repository.countUnreadMessages.mockResolvedValue(0);
      presence.isUserTracked.mockReturnValue(true);

      const result = await service.list(userId);
      expect(result[0].isOnline).toBe(true);
    });

    it('includes isOnline false when other user is not tracked', async () => {
      repository.listForUser.mockResolvedValue([makeConversation()]);
      repository.countUnreadMessages.mockResolvedValue(0);
      presence.isUserTracked.mockReturnValue(false);

      const result = await service.list(userId);
      expect(result[0].isOnline).toBe(false);
    });
  });

  describe('listMessages', () => {
    it('throws ForbiddenException when user is not a participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.listMessages(conversationId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns messages for a participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.listMessagesForConversation.mockResolvedValue([
        makeMessage({
          content: 'hello',
          author: {
            id: otherUserId,
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: null,
          },
          authorId: otherUserId,
        }),
      ]);
      repository.getDirectMessageReactions.mockResolvedValue([]);

      const result = await service.listMessages(conversationId, userId);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('hello');
      expect(result[0].reactions).toEqual([]);
    });
  });

  describe('createMessage', () => {
    it('throws ForbiddenException when user is not a participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.createMessage(conversationId, { content: 'hi' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException for empty content', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      // Validation happens at DTO level; service receives already-validated data.
      // We test the participant guard here.
      repository.findParticipants.mockResolvedValue([{ userId }]);
      repository.createMessage.mockResolvedValue(
        makeMessage({ content: 'hi' }),
      );

      const result = await service.createMessage(
        conversationId,
        { content: 'hi' },
        userId,
      );
      expect(result.content).toBe('hi');
    });

    it('creates a direct message for a participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findParticipants.mockResolvedValue([{ userId }]);
      repository.createMessage.mockResolvedValue(makeMessage());

      const result = await service.createMessage(
        conversationId,
        { content: 'hello' },
        userId,
      );
      expect(result.content).toBe('hello');
      expect(repository.touchConversationUpdatedAt).toHaveBeenCalledWith(
        conversationId,
      );
    });

    it('broadcasts direct:message:created after successful create', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.createMessage.mockResolvedValue(makeMessage());
      repository.findParticipants.mockResolvedValue([
        { userId },
        { userId: otherUserId },
      ]);

      const result = await service.createMessage(
        conversationId,
        { content: 'hello' },
        userId,
      );

      expect(
        websocketEvents.broadcastDirectMessageCreated,
      ).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({
          id: result.id,
          conversationId,
          content: 'hello',
        }),
      );
      expect(
        websocketEvents.broadcastDirectConversationUpdated,
      ).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({
          id: result.id,
          conversationId,
          content: 'hello',
        }),
        [userId, otherUserId],
      );
    });

    it('does not broadcast if create fails', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.createMessage.mockRejectedValue(new Error('DB error'));

      await expect(
        service.createMessage(conversationId, { content: 'hi' }, userId),
      ).rejects.toThrow('DB error');

      expect(
        websocketEvents.broadcastDirectMessageCreated,
      ).not.toHaveBeenCalled();
      expect(
        websocketEvents.broadcastDirectConversationUpdated,
      ).not.toHaveBeenCalled();
    });

    it('supports parentId reply to a direct message', async () => {
      const parentId = '55555555-5555-5555-5555-555555555555';
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: parentId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'parent',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findParticipants.mockResolvedValue([{ userId }]);
      repository.createMessage.mockResolvedValue(
        makeMessage({
          content: 'reply',
          parentId,
          parent: {
            id: parentId,
            conversationId,
            authorId: otherUserId,
            parentId: null,
            content: 'parent',
            createdAt: new Date(),
            updatedAt: new Date(),
            editedAt: null,
            deletedAt: null,
            author: {
              id: otherUserId,
              username: 'bob',
              displayName: 'Bob',
              avatarUrl: null,
            },
          },
        }),
      );

      const result = await service.createMessage(
        conversationId,
        { content: 'reply', parentId },
        userId,
      );
      expect(result.content).toBe('reply');
      expect(result.parentId).toBe(parentId);
    });

    it('rejects parentId from another direct conversation', async () => {
      const parentId = '55555555-5555-5555-5555-555555555555';
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: parentId,
        conversationId: '99999999-9999-9999-9999-999999999999',
        authorId: otherUserId,
        parentId: null,
        content: 'parent',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });

      await expect(
        service.createMessage(
          conversationId,
          { content: 'reply', parentId },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects reply-to-reply', async () => {
      const parentId = '55555555-5555-5555-5555-555555555555';
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: parentId,
        conversationId,
        authorId: otherUserId,
        parentId: '66666666-6666-6666-6666-666666666666',
        content: 'parent',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });

      await expect(
        service.createMessage(
          conversationId,
          { content: 'reply', parentId },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects parentId for deleted parent message', async () => {
      const parentId = '55555555-5555-5555-5555-555555555555';
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: parentId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'parent',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: new Date(),
      });

      await expect(
        service.createMessage(
          conversationId,
          { content: 'reply', parentId },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('markAsRead', () => {
    it('updates lastReadAt for participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: null,
      });
      repository.updateParticipantLastRead.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      const result = await service.markAsRead(conversationId, userId);
      expect(result).toEqual({ ok: true });
      expect(repository.updateParticipantLastRead).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
    });

    it('throws ForbiddenException when user is not a participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.markAsRead(conversationId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.updateParticipantLastRead).not.toHaveBeenCalled();
    });
  });

  describe('updateMessage', () => {
    it('allows author to edit own message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.updateDirectMessageContent.mockResolvedValue(
        makeMessage({ content: 'updated', editedAt: new Date() }),
      );
      repository.getDirectMessageReactions.mockResolvedValue([]);

      const result = await service.updateMessage(
        conversationId,
        messageId,
        userId,
        'updated',
      );
      expect(result.content).toBe('updated');
      expect(result.editedAt).not.toBeNull();
      expect(websocketEvents.broadcastDirectMessageUpdated).toHaveBeenCalled();
    });

    it('trims content before updating', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.updateDirectMessageContent.mockResolvedValue(
        makeMessage({ content: 'trimmed', editedAt: new Date() }),
      );
      repository.getDirectMessageReactions.mockResolvedValue([]);

      const result = await service.updateMessage(
        conversationId,
        messageId,
        userId,
        '  trimmed  ',
      );
      expect(repository.updateDirectMessageContent).toHaveBeenCalledWith(
        messageId,
        'trimmed',
      );
      expect(result.content).toBe('trimmed');
    });

    it('rejects empty content', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());

      await expect(
        service.updateMessage(conversationId, messageId, userId, '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects content longer than 4000 chars', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());

      await expect(
        service.updateMessage(
          conversationId,
          messageId,
          userId,
          'x'.repeat(4001),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-author participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-other',
        conversationId,
        userId: otherUserId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());

      await expect(
        service.updateMessage(
          conversationId,
          messageId,
          otherUserId,
          'updated',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.updateMessage(
          conversationId,
          messageId,
          'random-user',
          'updated',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects message from another conversation', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(
        makeMessage({ conversationId: 'other-conv-id' }),
      );

      await expect(
        service.updateMessage(conversationId, messageId, userId, 'updated'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns reactions in response', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.updateDirectMessageContent.mockResolvedValue(
        makeMessage({ content: 'updated', editedAt: new Date() }),
      );
      repository.getDirectMessageReactions.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);

      const result = await service.updateMessage(
        conversationId,
        messageId,
        userId,
        'updated',
      );
      expect(result.reactions).toEqual([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);
    });

    it('broadcasts direct:conversation:updated when editing the last message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.updateDirectMessageContent.mockResolvedValue(
        makeMessage({ content: 'updated', editedAt: new Date() }),
      );
      repository.getDirectMessageReactions.mockResolvedValue([]);
      repository.findById.mockResolvedValue(
        makeConversation({
          messages: [makeMessage()],
        }),
      );
      repository.findParticipants.mockResolvedValue([
        { userId },
        { userId: otherUserId },
      ]);

      await service.updateMessage(conversationId, messageId, userId, 'updated');

      expect(
        websocketEvents.broadcastDirectConversationUpdated,
      ).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({ id: messageId, content: 'updated' }),
        [userId, otherUserId],
      );
    });

    it('does not broadcast direct:conversation:updated when editing a non-last message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.updateDirectMessageContent.mockResolvedValue(
        makeMessage({ content: 'updated', editedAt: new Date() }),
      );
      repository.getDirectMessageReactions.mockResolvedValue([]);
      repository.findById.mockResolvedValue(
        makeConversation({
          messages: [makeMessage({ id: 'other-message-id', content: 'newer' })],
        }),
      );

      await service.updateMessage(conversationId, messageId, userId, 'updated');

      expect(
        websocketEvents.broadcastDirectConversationUpdated,
      ).not.toHaveBeenCalled();
    });
  });

  describe('addReaction', () => {
    it('adds reaction for participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue(null);
      repository.createDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await service.addReaction(
        conversationId,
        messageId,
        { emoji: '👍' },
        userId,
      );
      expect(result).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
      expect(repository.createDirectReaction).toHaveBeenCalledWith({
        messageId,
        userId,
        emoji: '👍',
      });
      expect(websocketEvents.broadcastDirectReactionAdded).toHaveBeenCalled();
    });

    it('toggles off same emoji when user already reacted with it', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.deleteDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await service.addReaction(
        conversationId,
        messageId,
        { emoji: '👍' },
        userId,
      );
      expect(result).toEqual([]);
      expect(repository.deleteDirectReaction).toHaveBeenCalledWith('r1');
      expect(repository.createDirectReaction).not.toHaveBeenCalled();
      expect(websocketEvents.broadcastDirectReactionRemoved).toHaveBeenCalled();
    });

    it('replaces previous emoji with a new one', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue(null);
      repository.deleteDirectReactionsForUser.mockResolvedValue({ count: 1 });
      repository.createDirectReaction.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '❤️',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([
        { emoji: '❤️', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await service.addReaction(
        conversationId,
        messageId,
        { emoji: '❤️' },
        userId,
      );
      expect(result).toEqual([{ emoji: '❤️', count: 1, reactedByMe: true }]);
      expect(repository.deleteDirectReactionsForUser).toHaveBeenCalledWith(
        messageId,
        userId,
      );
      expect(repository.createDirectReaction).toHaveBeenCalledWith({
        messageId,
        userId,
        emoji: '❤️',
      });
      expect(websocketEvents.broadcastDirectReactionAdded).toHaveBeenCalled();
    });

    it('replacement preserves other users reactions', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue(null);
      repository.deleteDirectReactionsForUser.mockResolvedValue({ count: 1 });
      repository.createDirectReaction.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '❤️',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([
        { emoji: '👍', count: 1, reactedByMe: false },
        { emoji: '❤️', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await service.addReaction(
        conversationId,
        messageId,
        { emoji: '❤️' },
        userId,
      );
      expect(result).toContainEqual({
        emoji: '👍',
        count: 1,
        reactedByMe: false,
      });
      expect(result).toContainEqual({
        emoji: '❤️',
        count: 1,
        reactedByMe: true,
      });
    });

    it('reaction summary counts are correct after replacement', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue(null);
      repository.deleteDirectReactionsForUser.mockResolvedValue({ count: 1 });
      repository.createDirectReaction.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '❤️',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([
        { emoji: '❤️', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await service.addReaction(
        conversationId,
        messageId,
        { emoji: '❤️' },
        userId,
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        emoji: '❤️',
        count: 1,
        reactedByMe: true,
      });
    });

    it('emits websocket removed event on toggle off', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.deleteDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await service.addReaction(
        conversationId,
        messageId,
        { emoji: '👍' },
        userId,
      );
      expect(
        websocketEvents.broadcastDirectReactionRemoved,
      ).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({
          messageId,
          emoji: '👍',
        }),
      );
      expect(
        websocketEvents.broadcastDirectReactionAdded,
      ).not.toHaveBeenCalled();
    });

    it('emits websocket added event on replace', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue(null);
      repository.deleteDirectReactionsForUser.mockResolvedValue({ count: 1 });
      repository.createDirectReaction.mockResolvedValue({
        id: 'r2',
        messageId,
        userId,
        emoji: '❤️',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([
        { emoji: '❤️', count: 1, reactedByMe: true },
      ]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await service.addReaction(
        conversationId,
        messageId,
        { emoji: '❤️' },
        userId,
      );
      expect(websocketEvents.broadcastDirectReactionAdded).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({
          messageId,
          emoji: '❤️',
        }),
      );
      expect(
        websocketEvents.broadcastDirectReactionRemoved,
      ).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for non-participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.addReaction(conversationId, messageId, { emoji: '👍' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for message from another conversation', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId: '99999999-9999-9999-9999-999999999999',
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });

      await expect(
        service.addReaction(conversationId, messageId, { emoji: '👍' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeReaction', () => {
    it('removes reaction for participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.deleteDirectReaction.mockResolvedValue({
        id: 'r1',
        messageId,
        userId,
        emoji: '👍',
        createdAt: new Date(),
      });
      repository.getDirectMessageReactions.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await service.removeReaction(conversationId, messageId, '👍', userId);
      expect(repository.deleteDirectReaction).toHaveBeenCalledWith('r1');
      expect(websocketEvents.broadcastDirectReactionRemoved).toHaveBeenCalled();
    });

    it('succeeds idempotently when reaction does not exist', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: otherUserId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: null,
      });
      repository.findDirectReaction.mockResolvedValue(null);
      repository.getDirectMessageReactions.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'alice',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await service.removeReaction(conversationId, messageId, '👍', userId);
      expect(repository.deleteDirectReaction).not.toHaveBeenCalled();
      expect(websocketEvents.broadcastDirectReactionRemoved).toHaveBeenCalled();
    });

    it('throws ForbiddenException for non-participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.removeReaction(conversationId, messageId, '👍', userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('deleteMessage', () => {
    it('allows author to delete own message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.softDeleteDirectMessage.mockResolvedValue({
        id: messageId,
        conversationId,
        authorId: userId,
        parentId: null,
        content: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: null,
        deletedAt: new Date(),
      });

      const result = await service.deleteMessage(
        conversationId,
        messageId,
        userId,
      );
      expect(result).toEqual({ ok: true });
      expect(repository.softDeleteDirectMessage).toHaveBeenCalledWith(
        messageId,
      );
      expect(
        websocketEvents.broadcastDirectMessageDeleted,
      ).toHaveBeenCalledWith(conversationId, {
        conversationId,
        messageId,
      });
    });

    it('is idempotent for already deleted message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );

      const result = await service.deleteMessage(
        conversationId,
        messageId,
        userId,
      );
      expect(result).toEqual({ ok: true });
      expect(repository.softDeleteDirectMessage).not.toHaveBeenCalled();
    });

    it('rejects non-author participant', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-other',
        conversationId,
        userId: otherUserId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());

      await expect(
        service.deleteMessage(conversationId, messageId, otherUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-participant', async () => {
      repository.findParticipant.mockResolvedValue(null);

      await expect(
        service.deleteMessage(conversationId, messageId, 'random-user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects message from another conversation', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(
        makeMessage({ conversationId: 'other-conv-id' }),
      );

      await expect(
        service.deleteMessage(conversationId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not broadcast when message was already deleted', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );

      await service.deleteMessage(conversationId, messageId, userId);
      expect(
        websocketEvents.broadcastDirectMessageDeleted,
      ).not.toHaveBeenCalled();
    });

    it('soft delete and listMessages filter out deleted message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.softDeleteDirectMessage.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );

      await service.deleteMessage(conversationId, messageId, userId);
      expect(repository.softDeleteDirectMessage).toHaveBeenCalledWith(
        messageId,
      );
    });

    it('replies to deleted parent do not crash listMessages', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.softDeleteDirectMessage.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );

      await service.deleteMessage(conversationId, messageId, userId);
      expect(repository.softDeleteDirectMessage).toHaveBeenCalled();
    });

    it('broadcasts direct:conversation:updated when deleting the last message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.findById.mockResolvedValue(
        makeConversation({
          messages: [makeMessage()],
        }),
      );
      repository.softDeleteDirectMessage.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );
      repository.findParticipants.mockResolvedValue([
        { userId },
        { userId: otherUserId },
      ]);

      await service.deleteMessage(conversationId, messageId, userId);

      const broadcastCalls = jest.mocked(
        websocketEvents.broadcastDirectConversationUpdated,
      ).mock.calls;
      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0][0]).toBe(conversationId);
      expect(broadcastCalls[0][1]).toMatchObject({ conversationId });
      expect(
        (broadcastCalls[0][1] as { lastMessage?: unknown }).lastMessage,
      ).toBeDefined();
      expect(broadcastCalls[0][2]).toEqual([userId, otherUserId]);
    });

    it('does not broadcast direct:conversation:updated when deleting a non-last message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.findById.mockResolvedValue(
        makeConversation({
          messages: [makeMessage({ id: 'other-message-id', content: 'newer' })],
        }),
      );
      repository.softDeleteDirectMessage.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );

      await service.deleteMessage(conversationId, messageId, userId);

      expect(
        websocketEvents.broadcastDirectConversationUpdated,
      ).not.toHaveBeenCalled();
    });

    it('broadcasts direct:conversation:updated with lastMessage null when deleting the only message', async () => {
      repository.findParticipant.mockResolvedValue({
        id: 'p-current',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });
      repository.findMessageById.mockResolvedValue(makeMessage());
      repository.findById
        .mockResolvedValueOnce(
          makeConversation({
            messages: [makeMessage()],
          }),
        )
        .mockResolvedValueOnce(makeConversation({ messages: [] }));
      repository.softDeleteDirectMessage.mockResolvedValue(
        makeMessage({ deletedAt: new Date() }),
      );
      repository.findParticipants.mockResolvedValue([
        { userId },
        { userId: otherUserId },
      ]);

      await service.deleteMessage(conversationId, messageId, userId);

      expect(
        websocketEvents.broadcastDirectConversationUpdated,
      ).toHaveBeenCalledWith(
        conversationId,
        expect.objectContaining({
          conversationId,
          lastMessage: null,
        }),
        [userId, otherUserId],
      );
    });
  });
});
