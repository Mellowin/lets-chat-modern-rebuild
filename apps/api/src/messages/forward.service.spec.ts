import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, StorageBackend } from '@lets-chat/database';
import { ForwardService } from './forward.service';
import { MessagesService } from './messages.service';
import { DirectConversationsService } from '../direct-conversations/direct-conversations.service';
import { GroupsService } from '../groups/groups.service';
import { MessagesRepository } from './messages.repository';
import { DirectConversationsRepository } from '../direct-conversations/direct-conversations.repository';
import { GroupsRepository } from '../groups/groups.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { StorageService } from '../storage/storage.service';
import { BlocksService } from '../safety/blocks.service';
import { ForwardPermissionsHelper } from './forward-permissions.helper';
import { ForwardMessageDto } from './dto/forward-message.dto';

describe('ForwardService', () => {
  let service: ForwardService;
  let messagesRepository: jest.Mocked<MessagesRepository>;
  let directConversationsRepository: jest.Mocked<DirectConversationsRepository>;
  let groupsRepository: jest.Mocked<GroupsRepository>;
  let channelsRepository: jest.Mocked<ChannelsRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;
  let messagesService: jest.Mocked<MessagesService>;
  let directConversationsService: jest.Mocked<DirectConversationsService>;
  let groupsService: jest.Mocked<GroupsService>;
  let storageService: jest.Mocked<StorageService>;
  let prismaService: jest.Mocked<PrismaService>;
  let forwardPermissions: jest.Mocked<ForwardPermissionsHelper>;
  let blocksService: jest.Mocked<BlocksService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const channelId = '22222222-2222-2222-2222-222222222222';
  const otherUserId = '66666666-6666-6666-6666-666666666666';
  const otherChannelId = '99999999-9999-9999-9999-999999999999';
  const workspaceId = '33333333-3333-3333-3333-333333333333';
  const messageId = '44444444-4444-4444-4444-444444444444';
  const attachmentId = '55555555-5555-5555-5555-555555555555';

  const baseMessage = {
    id: messageId,
    channelId,
    content: 'original content',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    author: {
      id: userId,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    replyToMessage: null,
    forwardedFrom: null,
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ForwardService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
            attachment: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue({ id: attachmentId }),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              count: jest.fn().mockResolvedValue(0),
            },
          },
        },
        {
          provide: MessagesRepository,
          useValue: {
            findByIdWithRelations: jest.fn(),
          },
        },
        {
          provide: DirectConversationsRepository,
          useValue: {
            findMessageByIdWithRelations: jest.fn(),
            findParticipant: jest.fn(),
            findParticipants: jest.fn(),
            findActiveMember: jest.fn(),
          },
        },
        {
          provide: GroupsRepository,
          useValue: {
            findMessageByIdWithRelations: jest.fn(),
            findActiveMember: jest.fn(),
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
          provide: WorkspacesRepository,
          useValue: {
            findMemberRole: jest.fn(),
          },
        },
        {
          provide: MessagesService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'new-channel-msg' }),
          },
        },
        {
          provide: DirectConversationsService,
          useValue: {
            createMessage: jest.fn().mockResolvedValue({ id: 'new-dm-msg' }),
          },
        },
        {
          provide: GroupsService,
          useValue: {
            createMessage: jest.fn().mockResolvedValue({ id: 'new-group-msg' }),
          },
        },
        {
          provide: StorageService,
          useValue: {
            copyObject: jest.fn().mockResolvedValue(undefined),
            deleteObject: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: BlocksService,
          useValue: {
            requireNoBlockInEitherDirection: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: ForwardPermissionsHelper,
          useValue: {
            canViewSource: jest.fn().mockResolvedValue(true),
            toResponse: jest.fn().mockResolvedValue(undefined),
            maskResponse: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ForwardService);
    messagesRepository = moduleRef.get(MessagesRepository);
    directConversationsRepository = moduleRef.get(
      DirectConversationsRepository,
    );
    groupsRepository = moduleRef.get(GroupsRepository);
    channelsRepository = moduleRef.get(ChannelsRepository);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
    messagesService = moduleRef.get(MessagesService);
    directConversationsService = moduleRef.get(DirectConversationsService);
    groupsService = moduleRef.get(GroupsService);
    storageService = moduleRef.get(StorageService);
    prismaService = moduleRef.get(PrismaService);
    forwardPermissions = moduleRef.get(ForwardPermissionsHelper);
    blocksService = moduleRef.get(BlocksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('channel to channel', () => {
    it('forwards a message with content and attribution', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({ content: baseMessage.content }),
        userId,
        expect.objectContaining({
          sourceType: 'channel',
          sourceMessageId: messageId,
          sourceChatId: channelId,
          originalAuthorId: userId,
          originalAuthorName: 'Alice',
        }),
      );
    });

    it('prepends an optional comment to the original content', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
        comment: 'Check this out',
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({
          content: 'Check this out\n\noriginal content',
        }),
        userId,
        expect.anything(),
      );
    });

    it('throws NotFoundException when the source message is deleted', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        deletedAt: new Date(),
      } as any);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the user cannot view the source', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the destination channel does not exist', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue(null);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('copies attachments to a new storage key', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        {
          id: attachmentId,
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          storageKey: 'original/key.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
      ] as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(storageService.copyObject).toHaveBeenCalledWith(
        'original/key.pdf',
        expect.stringContaining('forwarded/'),
      );
      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          attachments: expect.arrayContaining([
            expect.objectContaining({
              fileName: 'doc.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1234,
              kind: 'file',
            }),
          ]),
        }),
        userId,
        expect.anything(),
      );
    });

    it('copies each attachment to a distinct forwarded key', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'a1',
          filename: 'one.pdf',
          mimeType: 'application/pdf',
          size: 100,
          storageKey: 'original/one.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'a2',
          filename: 'two.pdf',
          mimeType: 'application/pdf',
          size: 200,
          storageKey: 'original/two.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
      ] as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      const calls = (storageService.copyObject as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][1]).toContain('forwarded/');
      expect(calls[1][1]).toContain('forwarded/');
      expect(calls[0][1]).not.toEqual(calls[1][1]);
    });
  });

  describe('cross-chat destinations', () => {
    const dmId = '77777777-7777-7777-7777-777777777777';
    const groupId = '88888888-8888-8888-8888-888888888888';

    it('forwards to a direct conversation', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await service.forward(dto, userId);

      expect(directConversationsService.createMessage).toHaveBeenCalledWith(
        dmId,
        expect.objectContaining({ content: baseMessage.content }),
        userId,
        expect.objectContaining({ sourceType: 'channel' }),
      );
    });

    it('forwards to a group', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      groupsRepository.findActiveMember.mockResolvedValue({ id: 'm1' } as any);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'group',
        destinationId: groupId,
      };

      await service.forward(dto, userId);

      expect(groupsService.createMessage).toHaveBeenCalledWith(
        groupId,
        expect.objectContaining({ content: baseMessage.content }),
        userId,
        expect.objectContaining({ sourceType: 'channel' }),
      );
    });
  });

  describe('attribution', () => {
    it('attributes re-forward to the immediate source message, not the root', async () => {
      const rootMeta = {
        sourceType: 'direct',
        sourceMessageId: 'orig-msg',
        sourceChatId: 'orig-conv',
        originalAuthorId: 'other-user',
        originalAuthorName: 'Bob',
        originalCreatedAt: '2026-01-01T00:00:00.000Z',
      };

      const intermediateSource = {
        ...baseMessage,
        content: "B's note\n\nA's text",
        forwardedFrom: rootMeta,
        author: {
          id: otherUserId,
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
      };

      messagesRepository.findByIdWithRelations.mockResolvedValue(
        intermediateSource as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({ content: "B's note\n\nA's text" }),
        userId,
        expect.objectContaining({
          sourceType: 'channel',
          sourceMessageId: messageId,
          sourceChatId: channelId,
          originalAuthorId: otherUserId,
          originalAuthorName: 'Bob',
        }),
      );
      expect(messagesService.create).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining(rootMeta),
      );
    });

    it('attributes combined comment + source content to the immediate source', async () => {
      const rootMeta = {
        sourceType: 'direct',
        sourceMessageId: 'orig-msg',
        sourceChatId: 'orig-conv',
        originalAuthorId: 'other-user',
        originalAuthorName: 'Bob',
        originalCreatedAt: '2026-01-01T00:00:00.000Z',
      };

      const intermediateSource = {
        ...baseMessage,
        content: "B's note\n\nA's text",
        forwardedFrom: rootMeta,
        author: {
          id: otherUserId,
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
      };

      messagesRepository.findByIdWithRelations.mockResolvedValue(
        intermediateSource as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
        comment: "C's note",
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({
          content: "C's note\n\nB's note\n\nA's text",
        }),
        userId,
        expect.objectContaining({
          sourceType: 'channel',
          sourceMessageId: messageId,
          sourceChatId: channelId,
          originalAuthorId: otherUserId,
          originalAuthorName: 'Bob',
        }),
      );
    });
  });

  describe('group source deletion handling', () => {
    const groupId = '88888888-8888-8888-8888-888888888888';
    const dmId = '77777777-7777-7777-7777-777777777777';

    const groupSourceMessage = {
      id: messageId,
      groupId,
      content: 'group source content',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      author: {
        id: userId,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
      },
      replyToMessage: null,
      forwardedFrom: null,
      // GroupMessage has no deletedAt field, so it is undefined here.
    };

    it('forwards group -> channel when deletedAt is undefined', async () => {
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        channelId,
        expect.objectContaining({ content: groupSourceMessage.content }),
        userId,
        expect.objectContaining({ sourceType: 'group', sourceChatId: groupId }),
      );
    });

    it('forwards group -> direct', async () => {
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await service.forward(dto, userId);

      expect(directConversationsService.createMessage).toHaveBeenCalledWith(
        dmId,
        expect.objectContaining({ content: groupSourceMessage.content }),
        userId,
        expect.objectContaining({ sourceType: 'group', sourceChatId: groupId }),
      );
    });

    it('forwards group -> group', async () => {
      const destinationGroupId = '99999999-9999-9999-9999-999999999999';
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      groupsRepository.findActiveMember.mockResolvedValue({ id: 'm1' } as any);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'group',
        destinationId: destinationGroupId,
      };

      await service.forward(dto, userId);

      expect(groupsService.createMessage).toHaveBeenCalledWith(
        destinationGroupId,
        expect.objectContaining({ content: groupSourceMessage.content }),
        userId,
        expect.objectContaining({ sourceType: 'group', sourceChatId: groupId }),
      );
    });

    it('still rejects a deleted channel source', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        deletedAt: new Date(),
      } as any);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('still rejects a deleted direct source', async () => {
      directConversationsRepository.findMessageByIdWithRelations.mockResolvedValue(
        {
          ...baseMessage,
          conversationId: dmId,
          deletedAt: new Date(),
        } as any,
      );

      const dto: ForwardMessageDto = {
        sourceType: 'direct',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects archived group -> channel forwarding with NotFoundException', async () => {
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(forwardPermissions.canViewSource).toHaveBeenCalledWith(
        userId,
        'group',
        groupId,
      );
    });

    it('rejects archived group -> direct forwarding with NotFoundException', async () => {
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects archived group -> group forwarding with NotFoundException', async () => {
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);
      const destinationGroupId = '99999999-9999-9999-9999-999999999999';
      groupsRepository.findActiveMember.mockResolvedValue({ id: 'm1' } as any);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'group',
        destinationId: destinationGroupId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not copy attachments from an archived group source', async () => {
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupSourceMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        {
          id: attachmentId,
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          storageKey: 'original/key.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
      ] as any);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });
  });

  describe('same-chat rejection', () => {
    const dmId = '77777777-7777-7777-7777-777777777777';
    const groupId = '88888888-8888-8888-8888-888888888888';

    it('rejects channel -> same channel', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'Cannot forward a message to the same chat',
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });

    it('rejects direct -> same direct conversation', async () => {
      const directMessage = {
        ...baseMessage,
        conversationId: dmId,
        channelId: undefined,
      };
      directConversationsRepository.findMessageByIdWithRelations.mockResolvedValue(
        directMessage as any,
      );
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'direct',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'Cannot forward a message to the same chat',
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(directConversationsService.createMessage).not.toHaveBeenCalled();
    });

    it('rejects group -> same group', async () => {
      const groupMessage = {
        ...baseMessage,
        groupId,
        channelId: undefined,
      };
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        groupMessage as any,
      );
      groupsRepository.findActiveMember.mockResolvedValue({ id: 'm1' } as any);

      const dto: ForwardMessageDto = {
        sourceType: 'group',
        sourceMessageId: messageId,
        destinationType: 'group',
        destinationId: groupId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'Cannot forward a message to the same chat',
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(groupsService.createMessage).not.toHaveBeenCalled();
    });

    it('allows channel -> different channel', async () => {
      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalled();
    });

    it('allows cross-type forwarding', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await service.forward(dto, userId);

      expect(directConversationsService.createMessage).toHaveBeenCalled();
    });
  });

  describe('direct destination block check', () => {
    const dmId = '77777777-7777-7777-7777-777777777777';

    it('rejects forwarding to a direct conversation when the recipient is blocked', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        {
          id: attachmentId,
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          storageKey: 'original/key.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
      ] as any);
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);
      blocksService.requireNoBlockInEitherDirection.mockRejectedValue(
        new ForbiddenException('Cannot forward messages to this user'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(prismaService.attachment.create).not.toHaveBeenCalled();
      expect(directConversationsService.createMessage).not.toHaveBeenCalled();
    });

    it('rejects forwarding when the current user blocked the recipient', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        {
          id: attachmentId,
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          storageKey: 'original/key.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
      ] as any);
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);
      blocksService.requireNoBlockInEitherDirection.mockRejectedValue(
        new ForbiddenException('Cannot forward messages to this user'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(prismaService.attachment.create).not.toHaveBeenCalled();
      expect(directConversationsService.createMessage).not.toHaveBeenCalled();
    });

    it('allows forwarding to an unblocked direct conversation', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);
      blocksService.requireNoBlockInEitherDirection.mockResolvedValue(
        undefined,
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await service.forward(dto, userId);

      expect(
        blocksService.requireNoBlockInEitherDirection,
      ).toHaveBeenCalledWith(
        userId,
        otherUserId,
        'Cannot forward messages to this user',
      );
      expect(directConversationsService.createMessage).toHaveBeenCalled();
    });
  });

  describe('source access before same-chat validation', () => {
    const dmId = '77777777-7777-7777-7777-777777777777';

    it('returns NotFoundException for inaccessible source even when destination matches same chat', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(forwardPermissions.canViewSource).toHaveBeenCalledWith(
        userId,
        'channel',
        channelId,
      );
      expect(channelsRepository.findActiveById).not.toHaveBeenCalled();
      expect(storageService.copyObject).not.toHaveBeenCalled();
    });

    it('returns BadRequestException for accessible source forwarded to same chat', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(true);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: channelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'Cannot forward a message to the same chat',
      );
      expect(channelsRepository.findActiveById).not.toHaveBeenCalled();
      expect(storageService.copyObject).not.toHaveBeenCalled();
    });

    it('does not check direct destination block when source access is denied', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      forwardPermissions.canViewSource.mockResolvedValue(false);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(
        directConversationsRepository.findParticipant,
      ).not.toHaveBeenCalled();
      expect(
        blocksService.requireNoBlockInEitherDirection,
      ).not.toHaveBeenCalled();
      expect(storageService.copyObject).not.toHaveBeenCalled();
    });
  });

  describe('channel attachment batch preflight validation', () => {
    const otherChannelId = '99999999-9999-9999-9999-999999999999';
    const dmId = '77777777-7777-7777-7777-777777777777';

    const makeAttachment = (
      overrides: {
        id?: string;
        filename?: string;
        mimeType?: string;
        size?: number;
        storageKey?: string;
      } = {},
    ) => ({
      id: overrides.id ?? attachmentId,
      filename: overrides.filename ?? 'doc.pdf',
      mimeType: overrides.mimeType ?? 'application/pdf',
      size: overrides.size ?? 1234,
      storageKey: overrides.storageKey ?? 'original/key.pdf',
      storageBackend: StorageBackend.MINIO,
      createdAt: new Date(),
      deletedAt: null,
    });

    it('rejects too many source attachments before copying for a channel destination', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue(
        Array.from({ length: 11 }, (_, i) =>
          makeAttachment({ id: `att-${i}` }),
        ),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(prismaService.attachment.create).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });

    it('rejects total attachment size above channel limit before copying', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment({ size: 200 * 1024 * 1024 }),
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(prismaService.attachment.create).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });

    it('allows a valid attachment batch to a channel', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment(),
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(storageService.copyObject).toHaveBeenCalled();
      expect(messagesService.create).toHaveBeenCalled();
    });

    it('allows the same large batch to a direct destination when direct permits it', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue(
        Array.from({ length: 11 }, (_, i) =>
          makeAttachment({ id: `att-${i}` }),
        ),
      );
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await service.forward(dto, userId);

      expect(storageService.copyObject).toHaveBeenCalledTimes(11);
      expect(directConversationsService.createMessage).toHaveBeenCalled();
    });
  });

  describe('copy cleanup after failures', () => {
    const otherChannelId = '99999999-9999-9999-9999-999999999999';
    const dmId = '77777777-7777-7777-7777-777777777777';

    const makeAttachment = (id: string, filename = 'doc.pdf') => ({
      id,
      filename,
      mimeType: 'application/pdf',
      size: 1234,
      storageKey: `original/${id}.pdf`,
      storageBackend: StorageBackend.MINIO,
      createdAt: new Date(),
      deletedAt: null,
    });

    it('deletes the first copied object when the second copy fails', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
        makeAttachment('att-2'),
      ]);

      const copiedKeys: string[] = [];
      (storageService.copyObject as jest.Mock).mockImplementation(
        (_source: string, destinationKey: string) => {
          if (copiedKeys.length === 1) {
            return Promise.reject(new Error('copy failed'));
          }
          copiedKeys.push(destinationKey);
          return Promise.resolve(undefined);
        },
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow('copy failed');
      expect(copiedKeys.length).toBe(1);
      expect(storageService.deleteObject).toHaveBeenCalledWith(copiedKeys[0]);
      expect(prismaService.attachment.create).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });

    it('deletes copied objects when the channel destination rejects after copying', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);
      messagesService.create.mockRejectedValue(new Error('channel rejected'));

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'channel rejected',
      );
      expect(storageService.copyObject).toHaveBeenCalled();
      expect(storageService.deleteObject).toHaveBeenCalled();
      expect(messagesService.create).toHaveBeenCalled();
    });

    it('removes unattached rows and copied objects when direct destination rejects', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);
      directConversationsService.createMessage.mockRejectedValue(
        new Error('direct rejected'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'direct rejected',
      );
      expect(prismaService.attachment.create).toHaveBeenCalled();
      expect(prismaService.attachment.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: [attachmentId] },
          messageId: null,
          directMessageId: null,
          groupMessageId: null,
        },
      });
      expect(storageService.deleteObject).toHaveBeenCalled();
      expect(directConversationsService.createMessage).toHaveBeenCalled();
    });

    it('does not delete copied objects when an attachment row is still referenced', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);
      messagesService.create.mockRejectedValue(new Error('channel rejected'));
      (prismaService.attachment.count as jest.Mock).mockResolvedValue(1);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'channel rejected',
      );
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });

    it('does not let cleanup failure hide the original forwarding error', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);
      messagesService.create.mockRejectedValue(new Error('channel rejected'));
      (storageService.deleteObject as jest.Mock).mockRejectedValue(
        new Error('cleanup failed'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'channel rejected',
      );
    });

    it('does not clean up after a successful forward', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(storageService.copyObject).toHaveBeenCalled();
      expect(storageService.deleteObject).not.toHaveBeenCalled();
      expect(prismaService.attachment.deleteMany).not.toHaveBeenCalled();
    });

    it('copies sequentially and cleans up a key that resolves after a later copy fails', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
        makeAttachment('att-2'),
      ]);

      let resolveFirst: (() => void) | undefined;
      let firstDestinationKey: string | undefined;
      (storageService.copyObject as jest.Mock).mockImplementation(
        (_source: string, destinationKey: string) => {
          if (!firstDestinationKey) {
            firstDestinationKey = destinationKey;
            return new Promise<void>((resolve) => {
              resolveFirst = resolve;
            });
          }
          return Promise.reject(new Error('second copy failed'));
        },
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      const forwardPromise = service.forward(dto, userId);
      // Let the initial async source/destination checks settle so that the
      // sequential copy loop reaches the first pending copy.
      await new Promise((resolve) => setImmediate(resolve));
      expect(storageService.copyObject).toHaveBeenCalledTimes(1);

      resolveFirst!();

      await expect(forwardPromise).rejects.toThrow('second copy failed');
      expect(firstDestinationKey).toBeDefined();
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        firstDestinationKey,
      );
    });

    it('deletes copied objects when direct attachment-row creation fails', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
        makeAttachment('att-2'),
      ]);
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);
      (prismaService.$transaction as jest.Mock).mockRejectedValue(
        new Error('transaction failed'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'transaction failed',
      );
      expect(storageService.copyObject).toHaveBeenCalledTimes(2);
      expect(directConversationsService.createMessage).not.toHaveBeenCalled();
      expect(storageService.deleteObject).toHaveBeenCalledTimes(2);
      expect(prismaService.attachment.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes copied objects when group attachment-row creation fails', async () => {
      const destinationGroupId = '99999999-9999-9999-9999-999999999999';
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
        makeAttachment('att-2'),
      ]);
      groupsRepository.findActiveMember.mockResolvedValue({ id: 'm1' } as any);
      (prismaService.$transaction as jest.Mock).mockRejectedValue(
        new Error('transaction failed'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'group',
        destinationId: destinationGroupId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'transaction failed',
      );
      expect(storageService.copyObject).toHaveBeenCalledTimes(2);
      expect(groupsService.createMessage).not.toHaveBeenCalled();
      expect(storageService.deleteObject).toHaveBeenCalledTimes(2);
      expect(prismaService.attachment.deleteMany).not.toHaveBeenCalled();
    });

    it('does not delete a linked attachment row or its object when destination fails after linking', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);
      directConversationsRepository.findParticipant.mockResolvedValue({
        id: 'p1',
      } as any);
      directConversationsRepository.findParticipants.mockResolvedValue([
        { userId, lastReadAt: null },
        { userId: otherUserId, lastReadAt: null },
      ]);
      directConversationsService.createMessage.mockRejectedValue(
        new Error('post-commit failure'),
      );
      (prismaService.attachment.count as jest.Mock).mockResolvedValue(1);

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'direct',
        destinationId: dmId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'post-commit failure',
      );
      expect(prismaService.attachment.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: [attachmentId] },
          messageId: null,
          directMessageId: null,
          groupMessageId: null,
        },
      });
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });

    it('does not delete copied objects when the reference count query fails', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: otherChannelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        makeAttachment('att-1'),
      ]);
      messagesService.create.mockRejectedValue(new Error('channel rejected'));
      (prismaService.attachment.count as jest.Mock).mockRejectedValue(
        new Error('count failed'),
      );

      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toThrow(
        'channel rejected',
      );
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('final content length validation', () => {
    it('accepts exactly 4000 characters', async () => {
      const longContent = 'a'.repeat(4000);
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        content: longContent,
      } as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({ content: longContent }),
        userId,
        expect.anything(),
      );
    });

    it('rejects 4001 characters', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        content: 'a'.repeat(4001),
      } as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });

    it('rejects 4000-character source plus comment', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        content: 'a'.repeat(4000),
      } as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
        comment: 'b',
      };

      await expect(service.forward(dto, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storageService.copyObject).not.toHaveBeenCalled();
      expect(messagesService.create).not.toHaveBeenCalled();
    });

    it('counts separator length correctly', async () => {
      const sourceContent = 'a'.repeat(3997);
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        content: sourceContent,
      } as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
        comment: 'b',
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({
          content: `b\n\n${sourceContent}`,
        }),
        userId,
        expect.anything(),
      );
    });

    it('ignores whitespace-only comment', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue(
        baseMessage as any,
      );
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
        comment: '   ',
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({ content: baseMessage.content }),
        userId,
        expect.anything(),
      );
    });

    it('allows attachment-only forwarding with no text', async () => {
      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        content: '',
      } as any);
      (prismaService.attachment.findMany as jest.Mock).mockResolvedValue([
        {
          id: attachmentId,
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          storageKey: 'original/key.pdf',
          storageBackend: StorageBackend.MINIO,
          createdAt: new Date(),
          deletedAt: null,
        },
      ] as any);
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const otherChannelId = '99999999-9999-9999-9999-999999999999';
      const dto: ForwardMessageDto = {
        sourceType: 'channel',
        sourceMessageId: messageId,
        destinationType: 'channel',
        destinationId: otherChannelId,
      };

      await service.forward(dto, userId);

      expect(storageService.copyObject).toHaveBeenCalled();
      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        otherChannelId,
        expect.objectContaining({ content: '' }),
        userId,
        expect.anything(),
      );
    });
  });
});
