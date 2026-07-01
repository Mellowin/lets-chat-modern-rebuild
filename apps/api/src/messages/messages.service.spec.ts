import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  MessagesService,
  classifyAttachmentKind,
  mapAttachmentResponse,
} from './messages.service';
import { MessagesRepository } from './messages.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PushService } from '../push/push.service';
import { MentionsService } from '../common/mentions.service';
type CreatedMessage = Awaited<ReturnType<MessagesRepository['createMessage']>>;
type ListedMessage = Awaited<
  ReturnType<MessagesRepository['listForChannel']>
>[number];
type UpdatedMessage = Awaited<ReturnType<MessagesRepository['updateMessage']>>;
type FoundMessage = NonNullable<
  Awaited<ReturnType<MessagesRepository['findById']>>
>;
type DeletedMessage = Awaited<
  ReturnType<MessagesRepository['softDeleteMessage']>
>;
type ActiveChannel = NonNullable<
  Awaited<ReturnType<ChannelsRepository['findActiveById']>>
>;

describe('MessagesService', () => {
  let service: MessagesService;
  let messagesRepository: jest.Mocked<MessagesRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;
  let channelsRepository: jest.Mocked<ChannelsRepository>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const workspaceId = '33333333-3333-3333-3333-333333333333';
  const channelId = '44444444-4444-4444-4444-444444444444';
  const messageId = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: MessagesRepository,
          useValue: {
            createMessage: jest.fn(),
            findById: jest.fn(),
            listForChannel: jest.fn(),
            updateMessage: jest.fn(),
            softDeleteMessage: jest.fn(),
            searchChannelMessages: jest.fn(),
            findByIdWithRelations: jest.fn(),
            findContextBefore: jest.fn(),
            findContextAfter: jest.fn(),
          },
        },
        {
          provide: WorkspacesRepository,
          useValue: {
            findMemberRole: jest.fn(),
          },
        },
        {
          provide: ChannelsRepository,
          useValue: {
            findActiveById: jest.fn(),
            findChannelMemberRole: jest.fn(),
            findMentionableUserIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: WebsocketEventsService,
          useValue: {
            broadcastMessageCreated: jest.fn(),
            broadcastMessageUpdated: jest.fn(),
            broadcastMessageDeleted: jest.fn(),
          },
        },
        {
          provide: PushService,
          useValue: {
            notifyChannelMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MentionsService,
          useValue: {
            resolveMentions: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MessagesService);
    messagesRepository = moduleRef.get(MessagesRepository);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
    channelsRepository = moduleRef.get(ChannelsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.create(workspaceId, channelId, { content: 'hello' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when channel belongs to another workspace', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId: '99999999-9999-9999-9999-999999999999',
        type: 'PUBLIC',
      } as ActiveChannel);

      await expect(
        service.create(workspaceId, channelId, { content: 'hello' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('paginates messages newest-first and returns a nextCursor for the oldest loaded', async () => {
      const messages = [
        {
          id: 'msg-newest',
          channelId,
          content: 'newest',
          createdAt: new Date('2026-06-30T12:00:02.000Z'),
          author: {
            id: userId,
            username: 'user',
            displayName: null,
            avatarUrl: null,
          },
        },
        {
          id: 'msg-middle',
          channelId,
          content: 'middle',
          createdAt: new Date('2026-06-30T12:00:01.000Z'),
          author: {
            id: userId,
            username: 'user',
            displayName: null,
            avatarUrl: null,
          },
        },
        {
          id: 'msg-oldest',
          channelId,
          content: 'oldest',
          createdAt: new Date('2026-06-30T12:00:00.000Z'),
          author: {
            id: userId,
            username: 'user',
            displayName: null,
            avatarUrl: null,
          },
        },
      ] as ListedMessage[];
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.listForChannel.mockResolvedValue(messages);

      const result = await service.list(workspaceId, channelId, userId, {
        limit: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((m) => m.content)).toEqual(['middle', 'newest']);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('2026-06-30T12:00:01.000Z:msg-middle');
    });

    it('throws BadRequestException for an invalid cursor', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.list(workspaceId, channelId, userId, {
          cursor: 'not-a-cursor',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for PUBLIC channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.create(workspaceId, channelId, { content: 'hello' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for PRIVATE channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.create(workspaceId, channelId, { content: 'hello' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for archived channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.create(workspaceId, channelId, { content: 'hello' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates message for PUBLIC channel member', async () => {
      const message = {
        id: messageId,
        channelId,
        content: 'hello',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
      } as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        { content: 'hello' },
        userId,
      );
      expect(result.content).toBe('hello');
    });

    it('creates message for PRIVATE channel member', async () => {
      const message = {
        id: messageId,
        channelId,
        content: 'hello',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
      } as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        { content: 'hello' },
        userId,
      );
      expect(result.content).toBe('hello');
    });

    it('returns empty attachments array for text-only message', async () => {
      const message = {
        id: messageId,
        channelId,
        content: 'hello',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      } as unknown as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        { content: 'hello' },
        userId,
      );
      expect(result.attachments).toEqual([]);
    });

    it('creates message with an image attachment', async () => {
      const message = {
        id: messageId,
        channelId,
        content: 'hello',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [
          {
            id: 'a1',
            filename: 'pic.png',
            mimeType: 'image/png',
            size: 5678,
            createdAt: new Date('2024-01-01'),
          },
        ],
      } as unknown as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        {
          content: 'hello',
          attachments: [
            {
              storageKey: 'attachments/user-id/uuid-pic.png',
              fileName: 'pic.png',
              mimeType: 'image/png',
              sizeBytes: 5678,
              kind: 'image',
            },
          ],
        },
        userId,
      );
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toMatchObject({
        id: 'a1',
        fileName: 'pic.png',
        mimeType: 'image/png',
        sizeBytes: 5678,
        kind: 'image',
      });
      expect(result.attachments[0]).not.toHaveProperty('storageKey');
      expect(messagesRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              storageKey: 'attachments/user-id/uuid-pic.png',
              filename: 'pic.png',
              mimeType: 'image/png',
              size: 5678,
              createdById: userId,
            },
          ],
        }),
      );
    });

    it('creates attachments-only message without content', async () => {
      const message = {
        id: messageId,
        channelId,
        content: '',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [
          {
            id: 'a1',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1234,
            createdAt: new Date('2024-01-01'),
          },
        ],
      } as unknown as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        {
          attachments: [
            {
              storageKey: 'attachments/user-id/uuid-doc.pdf',
              fileName: 'doc.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1234,
              kind: 'file',
            },
          ],
        },
        userId,
      );
      expect(result.attachments).toHaveLength(1);
      expect(result.content).toBe('');
    });

    it('throws BadRequest for empty content and no attachments', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.create(workspaceId, channelId, {}, userId),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(messagesRepository.createMessage).not.toHaveBeenCalled();
    });

    it('throws BadRequest when attachment kind does not match MIME', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.create(
          workspaceId,
          channelId,
          {
            attachments: [
              {
                storageKey: 'attachments/user-id/uuid-pic.png',
                fileName: 'pic.png',
                mimeType: 'image/png',
                sizeBytes: 5678,
                kind: 'file',
              },
            ],
          },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(messagesRepository.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.list(workspaceId, channelId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for archived channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.list(workspaceId, channelId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns messages for PUBLIC channel member', async () => {
      const messages = [
        {
          id: messageId,
          channelId,
          content: 'hello',
          author: {
            id: userId,
            username: 'user',
            displayName: null,
            avatarUrl: null,
          },
        },
      ] as ListedMessage[];
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.listForChannel.mockResolvedValue(messages);

      const result = await service.list(workspaceId, channelId, userId, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('hello');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('throws NotFoundException for PUBLIC channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.list(workspaceId, channelId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when channel belongs to another workspace', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId: '99999999-9999-9999-9999-999999999999',
        type: 'PUBLIC',
      } as ActiveChannel);

      await expect(
        service.list(workspaceId, channelId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for PRIVATE channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.list(workspaceId, channelId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns messages for PRIVATE channel member', async () => {
      const messages = [
        {
          id: messageId,
          channelId,
          content: 'secret',
          author: {
            id: userId,
            username: 'user',
            displayName: null,
            avatarUrl: null,
          },
        },
      ] as ListedMessage[];
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.listForChannel.mockResolvedValue(messages);

      const result = await service.list(workspaceId, channelId, userId, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('secret');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when non-author tries to edit', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
        createdAt: new Date(),
      } as FoundMessage);

      await expect(
        service.update(
          workspaceId,
          channelId,
          messageId,
          { content: 'edited' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for archived channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.update(
          workspaceId,
          channelId,
          messageId,
          { content: 'edited' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows author to edit within 15 minutes', async () => {
      const updated = {
        id: messageId,
        channelId,
        content: 'edited',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
      } as UpdatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      } as FoundMessage);
      messagesRepository.updateMessage.mockResolvedValue(updated);

      const result = await service.update(
        workspaceId,
        channelId,
        messageId,
        { content: 'edited' },
        userId,
      );
      expect(result.content).toBe('edited');
    });

    it('throws UnprocessableEntityException when edit window expired', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      } as FoundMessage);

      await expect(
        service.update(
          workspaceId,
          channelId,
          messageId,
          { content: 'edited' },
          userId,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFoundException for deleted message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: new Date(),
        createdAt: new Date(),
      } as FoundMessage);

      await expect(
        service.update(
          workspaceId,
          channelId,
          messageId,
          { content: 'edited' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for message from another channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId: '99999999-9999-9999-9999-999999999999',
        authorId: userId,
        deletedAt: null,
        createdAt: new Date(),
      } as FoundMessage);

      await expect(
        service.update(
          workspaceId,
          channelId,
          messageId,
          { content: 'edited' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException when MEMBER tries to delete another user message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
      } as FoundMessage);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows author to delete own message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: null,
      } as FoundMessage);
      messagesRepository.softDeleteMessage.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: new Date(),
      } as DeletedMessage);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException for archived channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows ADMIN to delete another user message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
      } as FoundMessage);
      messagesRepository.softDeleteMessage.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: new Date(),
      } as DeletedMessage);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).resolves.toBeUndefined();
    });

    it('allows OWNER to delete another user message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
      } as FoundMessage);
      messagesRepository.softDeleteMessage.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: new Date(),
      } as DeletedMessage);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException for already deleted message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: new Date(),
      } as FoundMessage);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachment helpers', () => {
    it('classifies image MIME as image', () => {
      expect(classifyAttachmentKind('image/png')).toBe('image');
      expect(classifyAttachmentKind('image/jpeg')).toBe('image');
      expect(classifyAttachmentKind('image/webp')).toBe('image');
    });

    it('classifies document MIME as file', () => {
      expect(classifyAttachmentKind('application/pdf')).toBe('file');
      expect(classifyAttachmentKind('text/plain')).toBe('file');
    });

    it('maps attachment without storageKey', () => {
      const mapped = mapAttachmentResponse({
        id: 'a1',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        createdAt: new Date('2024-01-01'),
      });
      expect(mapped).toMatchObject({
        id: 'a1',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        kind: 'file',
      });
      expect(mapped).not.toHaveProperty('storageKey');
    });

    it('maps image attachment with image kind', () => {
      const mapped = mapAttachmentResponse({
        id: 'a2',
        filename: 'pic.png',
        mimeType: 'image/png',
        size: 5678,
        createdAt: new Date('2024-01-01'),
      });
      expect(mapped.kind).toBe('image');
    });
  });

  describe('searchChannelMessages', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.searchChannelMessages(workspaceId, channelId, userId, {
          q: 'hello',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for archived channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.searchChannelMessages(workspaceId, channelId, userId, {
          q: 'hello',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for PUBLIC channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.searchChannelMessages(workspaceId, channelId, userId, {
          q: 'hello',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException for empty query after trim', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.searchChannelMessages(workspaceId, channelId, userId, {
          q: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns empty items when no results', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.searchChannelMessages.mockResolvedValue([]);

      const result = await service.searchChannelMessages(
        workspaceId,
        channelId,
        userId,
        { q: 'xyz' },
      );
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('returns mapped messages with attachments', async () => {
      const msg = {
        id: messageId,
        channelId,
        content: 'Hello world',
        parentId: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [
          {
            id: 'a1',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1234,
            createdAt: new Date('2024-01-01'),
          },
        ],
      };
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.searchChannelMessages.mockResolvedValue([
        msg,
      ] as unknown as ListedMessage[]);

      const result = await service.searchChannelMessages(
        workspaceId,
        channelId,
        userId,
        { q: 'hello' },
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('Hello world');
      expect(result.items[0].attachments).toHaveLength(1);
      expect(result.items[0].attachments[0]).not.toHaveProperty('storageKey');
      expect(result.nextCursor).toBeNull();
    });

    it('caps limit at 50', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.searchChannelMessages.mockResolvedValue([]);

      await service.searchChannelMessages(workspaceId, channelId, userId, {
        q: 'test',
        limit: 100,
      });
      expect(messagesRepository.searchChannelMessages).toHaveBeenCalledWith(
        channelId,
        'test',
        50,
        undefined,
      );
    });

    it('passes cursor to repository', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.searchChannelMessages.mockResolvedValue([]);

      await service.searchChannelMessages(workspaceId, channelId, userId, {
        q: 'test',
        cursor: messageId,
      });
      expect(messagesRepository.searchChannelMessages).toHaveBeenCalledWith(
        channelId,
        'test',
        20,
        messageId,
      );
    });

    it('returns nextCursor when more results exist', async () => {
      const msgs = Array.from({ length: 3 }, (_, i) => ({
        id: `msg-${i}`,
        channelId,
        content: `hello ${i}`,
        parentId: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      }));
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.searchChannelMessages.mockResolvedValue(
        msgs as unknown as ListedMessage[],
      );

      const result = await service.searchChannelMessages(
        workspaceId,
        channelId,
        userId,
        {
          q: 'hello',
          limit: 2,
        },
      );
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('msg-1');
    });
  });

  describe('getContext', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.getContext(workspaceId, channelId, messageId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for archived channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.getContext(workspaceId, channelId, messageId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when target message not found', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue(null);

      await expect(
        service.getContext(workspaceId, channelId, messageId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when target message belongs to another channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        id: messageId,
        channelId: 'other-channel',
        content: 'hello',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      } as unknown as ListedMessage);

      await expect(
        service.getContext(workspaceId, channelId, messageId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns before target after with correct ordering', async () => {
      const target = {
        id: messageId,
        channelId,
        content: 'target',
        parentId: null,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };
      const beforeMsg = {
        id: 'msg-before',
        channelId,
        content: 'before',
        parentId: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };
      const afterMsg = {
        id: 'msg-after',
        channelId,
        content: 'after',
        parentId: null,
        createdAt: new Date('2024-01-03T00:00:00.000Z'),
        updatedAt: new Date('2024-01-03T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };

      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        target as unknown as ListedMessage,
      );
      messagesRepository.findContextBefore.mockResolvedValue([
        beforeMsg,
      ] as unknown as ListedMessage[]);
      messagesRepository.findContextAfter.mockResolvedValue([
        afterMsg,
      ] as unknown as ListedMessage[]);

      const result = await service.getContext(
        workspaceId,
        channelId,
        messageId,
        userId,
        {},
      );
      expect(result.target.content).toBe('target');
      expect(result.before).toHaveLength(1);
      expect(result.before[0].content).toBe('before');
      expect(result.after).toHaveLength(1);
      expect(result.after[0].content).toBe('after');
      expect(result.hasMoreBefore).toBe(false);
      expect(result.hasMoreAfter).toBe(false);
    });

    it('sets hasMoreBefore when more results exist', async () => {
      const target = {
        id: messageId,
        channelId,
        content: 'target',
        parentId: null,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };
      const beforeMsgs = Array.from({ length: 3 }, (_, i) => ({
        id: `msg-before-${i}`,
        channelId,
        content: `before ${i}`,
        parentId: null,
        createdAt: new Date(2024, 0, 1, 0, 0, i),
        updatedAt: new Date(2024, 0, 1, 0, 0, i),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      }));

      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        target as unknown as ListedMessage,
      );
      messagesRepository.findContextBefore.mockResolvedValue(
        beforeMsgs as unknown as ListedMessage[],
      );
      messagesRepository.findContextAfter.mockResolvedValue([]);

      const result = await service.getContext(
        workspaceId,
        channelId,
        messageId,
        userId,
        { before: 2 },
      );
      expect(result.before).toHaveLength(2);
      expect(result.hasMoreBefore).toBe(true);
      expect(result.hasMoreAfter).toBe(false);
    });

    it('sets hasMoreAfter when more results exist', async () => {
      const target = {
        id: messageId,
        channelId,
        content: 'target',
        parentId: null,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };
      const afterMsgs = Array.from({ length: 3 }, (_, i) => ({
        id: `msg-after-${i}`,
        channelId,
        content: `after ${i}`,
        parentId: null,
        createdAt: new Date(2024, 0, 3, 0, 0, i),
        updatedAt: new Date(2024, 0, 3, 0, 0, i),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      }));

      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        target as unknown as ListedMessage,
      );
      messagesRepository.findContextBefore.mockResolvedValue([]);
      messagesRepository.findContextAfter.mockResolvedValue(
        afterMsgs as unknown as ListedMessage[],
      );

      const result = await service.getContext(
        workspaceId,
        channelId,
        messageId,
        userId,
        { after: 2 },
      );
      expect(result.after).toHaveLength(2);
      expect(result.hasMoreAfter).toBe(true);
      expect(result.hasMoreBefore).toBe(false);
    });

    it('caps before and after at 50', async () => {
      const target = {
        id: messageId,
        channelId,
        content: 'target',
        parentId: null,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };

      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        target as unknown as ListedMessage,
      );
      messagesRepository.findContextBefore.mockResolvedValue([]);
      messagesRepository.findContextAfter.mockResolvedValue([]);

      await service.getContext(workspaceId, channelId, messageId, userId, {
        before: 100,
        after: 100,
      });
      expect(messagesRepository.findContextBefore).toHaveBeenCalledWith(
        channelId,
        target.createdAt,
        50,
      );
      expect(messagesRepository.findContextAfter).toHaveBeenCalledWith(
        channelId,
        target.createdAt,
        50,
      );
    });

    it('excludes deleted surrounding messages via repository filter', async () => {
      const target = {
        id: messageId,
        channelId,
        content: 'target',
        parentId: null,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        editedAt: null,
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      };

      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        target as unknown as ListedMessage,
      );
      messagesRepository.findContextBefore.mockResolvedValue([]);
      messagesRepository.findContextAfter.mockResolvedValue([]);

      const result = await service.getContext(
        workspaceId,
        channelId,
        messageId,
        userId,
        {},
      );
      expect(result.before).toEqual([]);
      expect(result.after).toEqual([]);
    });
  });

  describe('message response with attachments', () => {
    it('returns empty attachments array when message has no attachments', async () => {
      const message = {
        id: messageId,
        channelId,
        content: 'hello',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        reactions: [],
        attachments: [],
      } as unknown as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        { content: 'hello' },
        userId,
      );
      expect(result.attachments).toEqual([]);
    });

    it('returns attachments metadata when message has attachments', async () => {
      const message = {
        id: messageId,
        channelId,
        content: 'hello',
        author: {
          id: userId,
          username: 'user',
          displayName: null,
          avatarUrl: null,
        },
        attachments: [
          {
            id: 'a1',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1234,
            createdAt: new Date('2024-01-01'),
          },
        ],
      } as unknown as CreatedMessage;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as ActiveChannel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.createMessage.mockResolvedValue(message);

      const result = await service.create(
        workspaceId,
        channelId,
        { content: 'hello' },
        userId,
      );
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toMatchObject({
        id: 'a1',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        kind: 'file',
      });
      expect(result.attachments[0]).not.toHaveProperty('storageKey');
    });
  });
});
