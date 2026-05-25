import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesRepository } from './messages.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';

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
      } as any);

      await expect(
        service.create(workspaceId, channelId, { content: 'hello' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for PUBLIC channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

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
      } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
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
      } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as any);
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
  });

  describe('list', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

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
      ] as any[];
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.listForChannel.mockResolvedValue(messages);

      const result = await service.list(workspaceId, channelId, userId, {});
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('hello');
    });

    it('throws NotFoundException for PUBLIC channel when user is not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
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
      } as any);

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
      } as any);
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
      ] as any[];
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.listForChannel.mockResolvedValue(messages);

      const result = await service.list(workspaceId, channelId, userId, {});
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('secret');
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when non-author tries to edit', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
        createdAt: new Date(),
      } as any);

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
      } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      } as any);
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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      } as any);

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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: new Date(),
        createdAt: new Date(),
      } as any);

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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId: '99999999-9999-9999-9999-999999999999',
        authorId: userId,
        deletedAt: null,
        createdAt: new Date(),
      } as any);

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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
      } as any);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows ADMIN to delete another user message', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
      } as any);
      messagesRepository.softDeleteMessage.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: new Date(),
      } as any);

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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: otherUserId,
        deletedAt: null,
      } as any);
      messagesRepository.softDeleteMessage.mockResolvedValue({
        id: messageId,
        channelId,
        deletedAt: new Date(),
      } as any);

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
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      messagesRepository.findById.mockResolvedValue({
        id: messageId,
        channelId,
        authorId: userId,
        deletedAt: new Date(),
      } as any);

      await expect(
        service.remove(workspaceId, channelId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
