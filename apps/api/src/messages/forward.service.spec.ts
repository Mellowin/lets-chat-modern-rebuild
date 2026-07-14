import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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

  const userId = '11111111-1111-1111-1111-111111111111';
  const channelId = '22222222-2222-2222-2222-222222222222';
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
            attachment: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue({ id: attachmentId }),
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

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        channelId,
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
        comment: 'Check this out',
      };

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        channelId,
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
        destinationId: channelId,
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
        destinationId: channelId,
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

      await service.forward(dto, userId);

      expect(storageService.copyObject).toHaveBeenCalledWith(
        'original/key.pdf',
        expect.stringContaining('forwarded/'),
      );
      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        channelId,
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
    it('preserves original attribution when forwarding an already-forwarded message', async () => {
      const existingMeta = {
        sourceType: 'direct',
        sourceMessageId: 'orig-msg',
        sourceChatId: 'orig-conv',
        originalAuthorId: 'other-user',
        originalAuthorName: 'Bob',
        originalCreatedAt: '2026-01-01T00:00:00.000Z',
      };

      messagesRepository.findByIdWithRelations.mockResolvedValue({
        ...baseMessage,
        forwardedFrom: existingMeta,
      } as any);
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

      await service.forward(dto, userId);

      expect(messagesService.create).toHaveBeenCalledWith(
        workspaceId,
        channelId,
        expect.anything(),
        userId,
        expect.objectContaining(existingMeta),
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
  });
});
