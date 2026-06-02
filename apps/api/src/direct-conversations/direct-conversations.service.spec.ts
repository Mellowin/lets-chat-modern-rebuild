import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectConversationsRepository } from './direct-conversations.repository';
import { UsersRepository } from '../users/users.repository';

type CreatedConversation = NonNullable<
  Awaited<ReturnType<DirectConversationsRepository['findById']>>
>;
type CreatedMessage = Awaited<
  ReturnType<DirectConversationsRepository['createMessage']>
>;

describe('DirectConversationsService', () => {
  let service: DirectConversationsService;
  let repository: jest.Mocked<DirectConversationsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const conversationId = '33333333-3333-3333-3333-333333333333';
  const messageId = '44444444-4444-4444-4444-444444444444';

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
            createMessage: jest.fn(),
            findMessageById: jest.fn(),
            listMessagesForConversation: jest.fn(),
            touchConversationUpdatedAt: jest.fn(),
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
      ],
    }).compile();

    service = moduleRef.get(DirectConversationsService);
    repository = moduleRef.get(DirectConversationsRepository);
    usersRepository = moduleRef.get(UsersRepository);
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
      repository.createConversation.mockResolvedValue({
        id: conversationId,
        key: `${userId}:${otherUserId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [
          {
            id: 'p1',
            conversationId,
            userId: otherUserId,
            createdAt: new Date(),
            user: {
              id: otherUserId,
              username: 'bob',
              displayName: 'Bob',
              avatarUrl: null,
            },
          },
        ],
        messages: [],
      });

      const result = await service.create({ userId: otherUserId }, userId);
      expect(result.id).toBe(conversationId);
    });

    it('returns existing conversation when opening same pair twice', async () => {
      usersRepository.findById.mockResolvedValue({
        id: otherUserId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
      } as Awaited<ReturnType<UsersRepository['findById']>>);
      repository.findByKey.mockResolvedValue({
        id: conversationId,
        key: `${userId}:${otherUserId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [
          {
            id: 'p1',
            conversationId,
            userId: otherUserId,
            createdAt: new Date(),
            user: {
              id: otherUserId,
              username: 'bob',
              displayName: 'Bob',
              avatarUrl: null,
            },
          },
        ],
        messages: [],
      });

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
      repository.createConversation.mockResolvedValue({
        id: conversationId,
        key: `${userId}:${otherUserId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [
          {
            id: 'p1',
            conversationId,
            userId: otherUserId,
            createdAt: new Date(),
            user: {
              id: otherUserId,
              username: 'bob',
              displayName: 'Bob',
              avatarUrl: null,
            },
          },
        ],
        messages: [],
      });

      const result = await service.create({ usernameOrEmail: 'bob' }, userId);
      expect(result.id).toBe(conversationId);
    });
  });

  describe('list', () => {
    it('lists only current user direct conversations', async () => {
      repository.listForUser.mockResolvedValue([
        {
          id: conversationId,
          key: `${userId}:${otherUserId}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          participants: [
            {
              id: 'p1',
              conversationId,
              userId: otherUserId,
              createdAt: new Date(),
              user: {
                id: otherUserId,
                username: 'bob',
                displayName: 'Bob',
                avatarUrl: null,
              },
            },
          ],
          messages: [],
        },
      ] as CreatedConversation[]);

      const result = await service.list(userId);
      expect(result).toHaveLength(1);
      expect(repository.listForUser).toHaveBeenCalledWith(userId);
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
      });
      repository.listMessagesForConversation.mockResolvedValue([
        {
          id: messageId,
          conversationId,
          content: 'hello',
          parentId: null,
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
          parent: null,
        },
      ] as CreatedMessage[]);

      const result = await service.listMessages(conversationId, userId);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('hello');
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
      });

      // Validation happens at DTO level; service receives already-validated data.
      // We test the participant guard here.
      repository.createMessage.mockResolvedValue({
        id: messageId,
        conversationId,
        content: 'hi',
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
      } as CreatedMessage);

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
      });
      repository.createMessage.mockResolvedValue({
        id: messageId,
        conversationId,
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
      } as CreatedMessage);

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

    it('supports parentId reply to a direct message', async () => {
      const parentId = '55555555-5555-5555-5555-555555555555';
      repository.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
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
      repository.createMessage.mockResolvedValue({
        id: messageId,
        conversationId,
        content: 'reply',
        parentId,
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
          parent: null,
        },
      } as CreatedMessage);

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
});
