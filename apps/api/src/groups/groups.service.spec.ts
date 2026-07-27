import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { ForwardPermissionsHelper } from '../messages/forward-permissions.helper';
import { StorageService } from '../storage/storage.service';
import { AttachmentsRepository } from '../messages/attachments.repository';
import {
  GroupsRepository,
  GroupWithMembersAndLastMessage,
  GroupMessageWithAuthor,
} from './groups.repository';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PushService } from '../push/push.service';
import { BlocksService } from '../safety/blocks.service';
import { MentionsService } from '../common/mentions.service';
import {
  UserRole,
  ContactPrivacySetting,
  StorageBackend,
} from '@lets-chat/database';

const userId = '11111111-1111-1111-1111-111111111111';
const otherUserId = '22222222-2222-2222-2222-222222222222';
const thirdUserId = '33333333-3333-3333-3333-333333333333';
const groupId = '44444444-4444-4444-4444-444444444444';
const messageId = '55555555-5555-5555-5555-555555555555';

const objectContaining = <T>(expected: T) =>
  expect.objectContaining(expected) as unknown as T;

function makeMember(
  overrides: Partial<GroupWithMembersAndLastMessage['members'][number]> = {},
): GroupWithMembersAndLastMessage['members'][number] {
  return {
    id: 'm-member',
    groupId,
    userId: otherUserId,
    role: 'MEMBER',
    joinedAt: new Date(),
    lastReadAt: null,
    leftAt: null,
    user: {
      id: otherUserId,
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    },
    ...overrides,
  };
}

function makeUser(
  overrides: Partial<Awaited<ReturnType<UsersRepository['findById']>>> = {},
): Awaited<ReturnType<UsersRepository['findById']>> {
  return {
    id: otherUserId,
    username: 'bob',
    email: 'bob@example.com',
    passwordHash: 'hash',
    displayName: 'Bob',
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    emailVerifiedAt: null,
    emailVerificationTokenHash: null,
    emailVerificationExpiresAt: null,
    emailVerificationSentAt: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    passwordResetSentAt: null,
    pendingEmail: null,
    emailChangeTokenHash: null,
    emailChangeExpiresAt: null,
    emailChangeSentAt: null,
    pushNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
    directMessageNotificationsEnabled: true,
    groupMessageNotificationsEnabled: true,
    channelMessageNotificationsEnabled: true,
    role: UserRole.USER,
    contactPrivacySetting: ContactPrivacySetting.REQUESTS_ONLY,
    ...overrides,
  };
}

function makeGroup(
  overrides: Partial<GroupWithMembersAndLastMessage> = {},
): GroupWithMembersAndLastMessage {
  const base: GroupWithMembersAndLastMessage = {
    id: groupId,
    name: 'Weekend trip',
    createdById: userId,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [
      makeMember({
        id: 'm-owner',
        userId,
        role: 'OWNER',
        user: {
          id: userId,
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
        },
      }),
      makeMember({ id: 'm-other' }),
    ],
    messages: [],
  };
  return { ...base, ...overrides };
}

function makeMessage(
  overrides: Partial<GroupMessageWithAuthor> = {},
): GroupMessageWithAuthor {
  const base: GroupMessageWithAuthor = {
    id: messageId,
    groupId,
    authorId: userId,
    content: 'Hello everyone!',
    replyToMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mentions: [],
    author: {
      id: userId,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    attachments: [],
    replyToMessage: null,
    pin: null,
    forwardedFrom: null,
  };
  return { ...base, ...overrides };
}

function makePin(
  overrides: Partial<Awaited<ReturnType<GroupsRepository['pinMessage']>>> = {},
): Awaited<ReturnType<GroupsRepository['pinMessage']>> {
  const base = {
    id: 'pin-id',
    messageId,
    groupId,
    pinnedByUserId: userId,
    pinnedAt: new Date(),
    pinnedBy: {
      id: userId,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    message: {
      id: messageId,
      groupId,
      authorId: userId,
      content: 'Hello everyone!',
      replyToMessageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      mentions: [],
      author: {
        id: userId,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
      },
      attachments: [],
      replyToMessage: null,
      forwardedFrom: null,
    },
  };
  return { ...base, ...overrides };
}

describe('GroupsService', () => {
  let service: GroupsService;
  let groupsRepository: jest.Mocked<GroupsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let websocketEvents: jest.Mocked<WebsocketEventsService>;
  let pushService: jest.Mocked<PushService>;
  let forwardPermissions: jest.Mocked<ForwardPermissionsHelper>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GroupsService,
        {
          provide: GroupsRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            listForUser: jest.fn(),
            updateName: jest.fn(),
            archive: jest.fn(),
            findMember: jest.fn(),
            findActiveMember: jest.fn(),
            listActiveMembers: jest.fn(),
            addMember: jest.fn(),
            removeMember: jest.fn(),
            leave: jest.fn(),
            countActiveMembers: jest.fn(),
            countOwners: jest.fn(),
            transferOwnership: jest.fn(),
            updateLastRead: jest.fn(),
            countUnreadMessages: jest.fn(),
            createMessage: jest.fn(),
            listMessages: jest.fn(),
            findMentionableUserIds: jest.fn().mockResolvedValue([]),
            touchUpdatedAt: jest.fn(),
            findMessageByIdWithRelations: jest.fn(),
            findContextBefore: jest.fn(),
            findContextAfter: jest.fn(),
            findUnattachedAttachmentsByIds: jest.fn(),
            pinMessage: jest.fn(),
            unpinMessage: jest.fn(),
            findPinnedMessages: jest.fn(),
            softDeleteGroupMessage: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByUsername: jest.fn(),
            findByEmail: jest.fn(),
            search: jest.fn(),
          },
        },
        {
          provide: WebsocketEventsService,
          useValue: {
            broadcastGroupMessageCreated: jest.fn(),
            broadcastGroupConversationUpdated: jest.fn(),
            broadcastGroupMemberRemoved: jest.fn(),
            broadcastGroupConversationRead: jest.fn(),
            broadcastGroupMessagePinned: jest.fn(),
            broadcastGroupMessageUnpinned: jest.fn(),
          },
        },
        {
          provide: PushService,
          useValue: {
            notifyGroupMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: BlocksService,
          useValue: {
            requireNoBlockInEitherDirection: jest
              .fn()
              .mockResolvedValue(undefined),
            isBlockedBy: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: MentionsService,
          useValue: {
            resolveMentions: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StorageService,
          useValue: {
            putObject: jest.fn().mockResolvedValue(undefined),
            getObject: jest.fn().mockResolvedValue({
              body: {} as unknown as ReadableStream,
              contentType: 'application/octet-stream',
              contentLength: 0,
            }),
          },
        },
        {
          provide: AttachmentsRepository,
          useValue: {
            findById: jest.fn(),
            createUnattachedAttachment: jest.fn(),
          },
        },
        {
          provide: ForwardPermissionsHelper,
          useValue: {
            canViewSource: jest.fn().mockResolvedValue(true),
            toResponse: jest.fn().mockResolvedValue(undefined),
            toResponses: jest
              .fn()
              .mockImplementation((_, items: unknown[]) =>
                Promise.resolve(items.map(() => undefined)),
              ),
            maskResponse: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(GroupsService);
    groupsRepository = moduleRef.get(GroupsRepository);
    usersRepository = moduleRef.get(UsersRepository);
    websocketEvents = moduleRef.get(WebsocketEventsService);
    pushService = moduleRef.get(PushService);
    forwardPermissions = moduleRef.get(ForwardPermissionsHelper);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a group with members', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      groupsRepository.create.mockResolvedValue(makeGroup());
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.create(
        { name: 'Weekend trip', memberIds: [otherUserId] },
        userId,
      );

      expect(result.id).toBe(groupId);
      expect(result.myRole).toBe('OWNER');
      expect(result.members.map((m) => m.id)).toContain(otherUserId);
      expect(
        websocketEvents.broadcastGroupConversationUpdated,
      ).toHaveBeenCalledWith(groupId, objectContaining({ id: groupId }), [
        userId,
        otherUserId,
      ]);
    });

    it('rejects when creator is included in memberIds', async () => {
      await expect(
        service.create(
          { name: 'Bad group', memberIds: [userId, otherUserId] },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(groupsRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when a member user is not found', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Bad group', memberIds: [otherUserId] }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(groupsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns groups for the current user', async () => {
      groupsRepository.listForUser.mockResolvedValue([makeGroup()]);
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.list(userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(groupId);
      expect(groupsRepository.listForUser).toHaveBeenCalledWith(userId);
    });
  });

  describe('get', () => {
    it('returns a group for a member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.get(groupId, userId);

      expect(result.id).toBe(groupId);
      expect(result.myRole).toBe('OWNER');
    });

    it('throws NotFoundException for a non-member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(service.get(groupId, thirdUserId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('renames the group for the owner', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.updateName.mockResolvedValue(
        makeGroup({ name: 'Updated name' }),
      );
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.update(
        groupId,
        { name: 'Updated name' },
        userId,
      );

      expect(result.name).toBe('Updated name');
      expect(groupsRepository.updateName).toHaveBeenCalledWith(
        groupId,
        'Updated name',
      );
      expect(
        websocketEvents.broadcastGroupConversationUpdated,
      ).toHaveBeenCalled();
    });

    it('throws ForbiddenException for a non-owner', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-other', userId: otherUserId }),
      );

      await expect(
        service.update(groupId, { name: 'Hacked' }, otherUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(groupsRepository.updateName).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('works for the owner', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.archive.mockResolvedValue(
        makeGroup({ archivedAt: new Date() }),
      );

      const result = await service.archive(groupId, userId);

      expect(result.success).toBe(true);
      expect(groupsRepository.archive).toHaveBeenCalledWith(groupId);
      expect(
        websocketEvents.broadcastGroupConversationUpdated,
      ).toHaveBeenCalledWith(
        groupId,
        objectContaining({ archivedAt: expect.any(Date) as Date }),
        [userId, otherUserId],
      );
    });
  });

  describe('addMember', () => {
    it('works for the owner', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findById.mockResolvedValue(makeGroup());
      usersRepository.findById.mockResolvedValue(makeUser({ id: thirdUserId }));
      groupsRepository.addMember.mockResolvedValue(
        makeMember({ id: 'm-third', userId: thirdUserId }),
      );
      groupsRepository.findById.mockResolvedValue(
        makeGroup({
          members: [
            ...makeGroup().members,
            makeMember({
              id: 'm-third',
              userId: thirdUserId,
              user: {
                id: thirdUserId,
                username: 'carol',
                displayName: 'Carol',
                avatarUrl: null,
              },
            }),
          ],
        }),
      );
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.addMember(
        groupId,
        { userId: thirdUserId },
        userId,
      );

      expect(result.members.map((m) => m.id)).toContain(thirdUserId);
      expect(groupsRepository.addMember).toHaveBeenCalledWith(
        groupId,
        thirdUserId,
      );
      expect(
        websocketEvents.broadcastGroupConversationUpdated,
      ).toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('works for the owner and removes the target', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.removeMember.mockResolvedValue({ count: 1 });
      groupsRepository.findById.mockResolvedValue(
        makeGroup({
          members: [makeGroup().members[0]],
        }),
      );
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.removeMember(groupId, otherUserId, userId);

      expect(result.members.map((m) => m.id)).not.toContain(otherUserId);
      expect(groupsRepository.removeMember).toHaveBeenCalledWith(
        groupId,
        otherUserId,
      );
      expect(websocketEvents.broadcastGroupMemberRemoved).toHaveBeenCalledWith(
        groupId,
        { userId: otherUserId },
      );
    });

    it('rejects self-removal by the owner', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );

      await expect(
        service.removeMember(groupId, userId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(groupsRepository.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('works for a member', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-other', userId: otherUserId }),
      );
      groupsRepository.leave.mockResolvedValue({ count: 1 });

      const result = await service.leave(groupId, otherUserId);

      expect(result.success).toBe(true);
      expect(groupsRepository.leave).toHaveBeenCalledWith(groupId, otherUserId);
      expect(websocketEvents.broadcastGroupMemberRemoved).toHaveBeenCalledWith(
        groupId,
        { userId: otherUserId },
      );
    });

    it('rejects the sole owner leaving', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.countOwners.mockResolvedValue(1);

      await expect(service.leave(groupId, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(groupsRepository.leave).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('returns messages for a member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.listMessages.mockResolvedValue([
        makeMessage({ content: 'Hi team' }),
      ]);

      const result = await service.listMessages(groupId, userId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('Hi team');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(groupsRepository.listMessages).toHaveBeenCalledWith(
        groupId,
        50,
        undefined,
      );
    });

    it('throws NotFoundException for a non-member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.listMessages(groupId, thirdUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(groupsRepository.listMessages).not.toHaveBeenCalled();
    });

    it('paginates messages newest-first and returns a nextCursor for the oldest loaded', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.listMessages.mockResolvedValue([
        makeMessage({
          id: 'msg-newest',
          content: 'newest',
          createdAt: new Date('2026-06-30T12:00:02.000Z'),
        }),
        makeMessage({
          id: 'msg-middle',
          content: 'middle',
          createdAt: new Date('2026-06-30T12:00:01.000Z'),
        }),
        makeMessage({
          id: 'msg-oldest',
          content: 'oldest',
          createdAt: new Date('2026-06-30T12:00:00.000Z'),
        }),
      ]);

      const result = await service.listMessages(groupId, userId, { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((m) => m.content)).toEqual(['middle', 'newest']);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('2026-06-30T12:00:01.000Z:msg-middle');
    });

    it('batches forwarded-from permission checks for a page', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      const messages = [
        makeMessage({
          id: 'msg-1',
          content: 'first',
          forwardedFrom: {
            sourceType: 'channel',
            sourceChatId: 'other-channel-1',
            sourceMessageId: 'orig-1',
            originalCreatedAt: '2024-01-01T00:00:00Z',
          },
        }),
        makeMessage({
          id: 'msg-2',
          content: 'second',
          forwardedFrom: {
            sourceType: 'channel',
            sourceChatId: 'other-channel-2',
            sourceMessageId: 'orig-2',
            originalCreatedAt: '2024-01-01T00:00:00Z',
          },
        }),
      ];
      groupsRepository.listMessages.mockResolvedValue(messages);

      await service.listMessages(groupId, userId);

      expect(forwardPermissions.toResponses).toHaveBeenCalledTimes(1);
      expect(forwardPermissions.toResponses).toHaveBeenCalledWith(
        userId,
        messages,
      );
      expect(forwardPermissions.toResponse).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an invalid cursor', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.listMessages(groupId, userId, { cursor: 'not-a-cursor' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMessageContext', () => {
    it('returns context for a member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        makeMessage({ id: 'target-msg', content: 'target' }),
      );
      groupsRepository.findContextBefore.mockResolvedValue([
        makeMessage({ id: 'before-msg', content: 'before' }),
      ]);
      groupsRepository.findContextAfter.mockResolvedValue([
        makeMessage({ id: 'after-msg', content: 'after' }),
      ]);

      const result = await service.getMessageContext(
        groupId,
        'target-msg',
        userId,
        { before: 10, after: 10 },
      );

      expect(result.target.content).toBe('target');
      expect(result.before).toHaveLength(1);
      expect(result.before[0].content).toBe('before');
      expect(result.after).toHaveLength(1);
      expect(result.after[0].content).toBe('after');
      expect(result.hasMoreBefore).toBe(false);
      expect(result.hasMoreAfter).toBe(false);
    });

    it('batches forwarded-from permission checks for context target + before + after', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      const target = makeMessage({
        id: 'target-msg',
        content: 'target',
        forwardedFrom: {
          sourceType: 'channel',
          sourceChatId: 'target-channel',
          sourceMessageId: 'orig-target',
          originalCreatedAt: '2024-01-01T00:00:00Z',
        },
      });
      const before = [
        makeMessage({
          id: 'before-msg',
          content: 'before',
          forwardedFrom: {
            sourceType: 'channel',
            sourceChatId: 'before-channel',
            sourceMessageId: 'orig-before',
            originalCreatedAt: '2024-01-01T00:00:00Z',
          },
        }),
      ];
      const after = [
        makeMessage({
          id: 'after-msg',
          content: 'after',
          forwardedFrom: {
            sourceType: 'channel',
            sourceChatId: 'after-channel',
            sourceMessageId: 'orig-after',
            originalCreatedAt: '2024-01-01T00:00:00Z',
          },
        }),
      ];
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(target);
      groupsRepository.findContextBefore.mockResolvedValue(before);
      groupsRepository.findContextAfter.mockResolvedValue(after);

      await service.getMessageContext(groupId, 'target-msg', userId, {
        before: 10,
        after: 10,
      });

      expect(forwardPermissions.toResponses).toHaveBeenCalledTimes(1);
      expect(forwardPermissions.toResponses).toHaveBeenCalledWith(userId, [
        ...before,
        target,
        ...after,
      ]);
      expect(forwardPermissions.toResponse).not.toHaveBeenCalled();
    });

    it('maps each context message to its own forwardedFrom metadata after reversing before', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findContextBefore.mockResolvedValue([]);
      groupsRepository.findContextAfter.mockResolvedValue([]);

      const target = makeMessage({
        id: 'target-msg',
        content: 'target',
        forwardedFrom: {
          sourceType: 'channel',
          sourceChatId: 'target-channel',
          sourceMessageId: 'orig-target',
          originalCreatedAt: '2024-01-01T00:00:00Z',
        },
      });
      const before1 = makeMessage({
        id: 'before-1',
        content: 'before 1',
        forwardedFrom: {
          sourceType: 'channel',
          sourceChatId: 'before-1-channel',
          sourceMessageId: 'orig-before-1',
          originalCreatedAt: '2024-01-01T00:00:00Z',
        },
      });
      const before2 = makeMessage({
        id: 'before-2',
        content: 'before 2',
        forwardedFrom: {
          sourceType: 'channel',
          sourceChatId: 'inaccessible-channel',
          sourceMessageId: 'orig-before-2',
          originalCreatedAt: '2024-01-01T00:00:00Z',
        },
      });
      const after1 = makeMessage({
        id: 'after-1',
        content: 'after 1',
        forwardedFrom: {
          sourceType: 'channel',
          sourceChatId: 'after-1-channel',
          sourceMessageId: 'orig-after-1',
          originalCreatedAt: '2024-01-01T00:00:00Z',
        },
      });

      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(target);
      groupsRepository.findContextBefore.mockResolvedValue([before1, before2]);
      groupsRepository.findContextAfter.mockResolvedValue([after1]);

      forwardPermissions.toResponses.mockImplementationOnce((_, items) =>
        Promise.resolve(
          (items as Array<{ id: string; forwardedFrom?: unknown }>).map(
            (item) => {
              const meta = item.forwardedFrom as
                | {
                    sourceType: 'channel';
                    sourceChatId: string;
                    sourceMessageId: string;
                    originalCreatedAt: string;
                  }
                | undefined;
              if (!meta) return undefined;
              if (meta.sourceChatId === 'inaccessible-channel') {
                return {
                  sourceType: meta.sourceType,
                  originalCreatedAt: meta.originalCreatedAt,
                  isAnonymous: true,
                };
              }
              return { ...meta, isAccessible: true };
            },
          ),
        ),
      );

      const result = await service.getMessageContext(
        groupId,
        'target-msg',
        userId,
        { before: 10, after: 10 },
      );

      expect(result.before).toHaveLength(2);
      expect(result.before[0].id).toBe('before-2');
      expect(result.before[0].forwardedFrom).toEqual({
        sourceType: 'channel',
        originalCreatedAt: '2024-01-01T00:00:00Z',
        isAnonymous: true,
      });
      expect(result.before[1].id).toBe('before-1');
      expect(result.before[1].forwardedFrom).toEqual({
        sourceType: 'channel',
        sourceChatId: 'before-1-channel',
        sourceMessageId: 'orig-before-1',
        originalCreatedAt: '2024-01-01T00:00:00Z',
        isAccessible: true,
      });
      expect(result.target.id).toBe('target-msg');
      expect(result.target.forwardedFrom).toEqual({
        sourceType: 'channel',
        sourceChatId: 'target-channel',
        sourceMessageId: 'orig-target',
        originalCreatedAt: '2024-01-01T00:00:00Z',
        isAccessible: true,
      });
      expect(result.after).toHaveLength(1);
      expect(result.after[0].id).toBe('after-1');
      expect(result.after[0].forwardedFrom).toEqual({
        sourceType: 'channel',
        sourceChatId: 'after-1-channel',
        sourceMessageId: 'orig-after-1',
        originalCreatedAt: '2024-01-01T00:00:00Z',
        isAccessible: true,
      });

      expect(forwardPermissions.toResponses).toHaveBeenCalledTimes(1);
      expect(forwardPermissions.toResponses).toHaveBeenCalledWith(userId, [
        before1,
        before2,
        target,
        after1,
      ]);
      expect(forwardPermissions.toResponse).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a non-member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.getMessageContext(groupId, messageId, thirdUserId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when message belongs to another group', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        makeMessage({ groupId: 'other-group-id' }),
      );

      await expect(
        service.getMessageContext(groupId, messageId, userId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createMessage', () => {
    it('sends a message, broadcasts, and calls pushService.notifyGroupMessage', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.createMessage.mockResolvedValue(makeMessage());
      groupsRepository.touchUpdatedAt.mockResolvedValue(makeGroup());
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.createMessage(
        groupId,
        { content: 'Hello everyone!' },
        userId,
      );

      expect(result.content).toBe('Hello everyone!');
      expect(groupsRepository.createMessage).toHaveBeenCalledWith({
        groupId,
        authorId: userId,
        content: 'Hello everyone!',
        replyToMessageId: null,
        mentions: [],
      });
      expect(groupsRepository.touchUpdatedAt).toHaveBeenCalledWith(groupId);
      expect(websocketEvents.broadcastGroupMessageCreated).toHaveBeenCalledWith(
        groupId,
        objectContaining({
          id: messageId,
          groupId,
          content: 'Hello everyone!',
          replyToMessageId: null,
        }),
      );
      expect(
        websocketEvents.broadcastGroupConversationUpdated,
      ).toHaveBeenCalledWith(groupId, objectContaining({ id: groupId }), [
        userId,
        otherUserId,
      ]);
      expect(pushService.notifyGroupMessage).toHaveBeenCalledWith(groupId, {
        id: messageId,
        content: 'Hello everyone!',
        authorId: userId,
      });
    });

    it('throws NotFoundException for a non-member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.createMessage(groupId, { content: 'Spam' }, thirdUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(groupsRepository.createMessage).not.toHaveBeenCalled();
      expect(pushService.notifyGroupMessage).not.toHaveBeenCalled();
    });

    it('links attachments and includes them in the response', async () => {
      const attachmentId = '66666666-6666-6666-6666-666666666666';
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findUnattachedAttachmentsByIds.mockResolvedValue([
        { id: attachmentId },
      ]);
      groupsRepository.createMessage.mockResolvedValue(
        makeMessage({
          attachments: [
            {
              id: attachmentId,
              filename: 'image.png',
              mimeType: 'image/png',
              size: 5678,
              storageKey: 'attachments/user/image.png',
              storageBackend: StorageBackend.MINIO,
              createdAt: new Date(),
            },
          ],
        }),
      );
      groupsRepository.touchUpdatedAt.mockResolvedValue(makeGroup());
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.createMessage(
        groupId,
        { content: 'Hello everyone!', attachmentIds: [attachmentId] },
        userId,
      );

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toMatchObject({
        id: attachmentId,
        fileName: 'image.png',
        mimeType: 'image/png',
        sizeBytes: 5678,
        kind: 'image',
      });
      expect(groupsRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: [attachmentId] }),
      );
    });

    it('rejects invalid or already-used attachments', async () => {
      const attachmentId = '66666666-6666-6666-6666-666666666666';
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findUnattachedAttachmentsByIds.mockResolvedValue([]);

      await expect(
        service.createMessage(
          groupId,
          { content: 'Hello everyone!', attachmentIds: [attachmentId] },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(groupsRepository.createMessage).not.toHaveBeenCalled();
    });

    it('creates attachment-only group message', async () => {
      const attachmentId = '66666666-6666-6666-6666-666666666666';
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findUnattachedAttachmentsByIds.mockResolvedValue([
        { id: attachmentId },
      ]);
      groupsRepository.createMessage.mockResolvedValue(
        makeMessage({
          content: '',
          attachments: [
            {
              id: attachmentId,
              filename: 'image.png',
              mimeType: 'image/png',
              size: 5678,
              storageKey: 'attachments/user/image.png',
              storageBackend: StorageBackend.MINIO,
              createdAt: new Date(),
            },
          ],
        }),
      );
      groupsRepository.touchUpdatedAt.mockResolvedValue(makeGroup());
      groupsRepository.countUnreadMessages.mockResolvedValue(0);

      const result = await service.createMessage(
        groupId,
        { attachmentIds: [attachmentId] },
        userId,
      );

      expect(result.content).toBe('');
      expect(result.attachments).toHaveLength(1);
      expect(groupsRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ content: '', attachmentIds: [attachmentId] }),
      );
    });

    it('throws BadRequest for empty content and no attachments', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.createMessage(groupId, {}, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(groupsRepository.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('pinMessage', () => {
    it('allows the owner to pin a message', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        makeMessage(),
      );
      groupsRepository.pinMessage.mockResolvedValue(makePin());

      const result = await service.pinMessage(groupId, messageId, userId);

      expect(result.id).toBe('pin-id');
      expect(result.pinnedBy.id).toBe(userId);
      expect(result.message.id).toBe(messageId);
      expect(groupsRepository.pinMessage).toHaveBeenCalledWith(
        groupId,
        messageId,
        userId,
      );
      expect(websocketEvents.broadcastGroupMessagePinned).toHaveBeenCalledWith(
        groupId,
        objectContaining({ id: messageId, groupId, pinnedByUserId: userId }),
      );
    });

    it('is idempotent when pinning an already pinned message', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        makeMessage(),
      );
      groupsRepository.pinMessage.mockResolvedValue(makePin());

      await service.pinMessage(groupId, messageId, userId);
      await service.pinMessage(groupId, messageId, userId);

      expect(groupsRepository.pinMessage).toHaveBeenCalledTimes(2);
      expect(websocketEvents.broadcastGroupMessagePinned).toHaveBeenCalledTimes(
        2,
      );
    });

    it('rejects pinning by a non-owner', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-other', userId: otherUserId }),
      );

      await expect(
        service.pinMessage(groupId, messageId, otherUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(groupsRepository.pinMessage).not.toHaveBeenCalled();
      expect(
        websocketEvents.broadcastGroupMessagePinned,
      ).not.toHaveBeenCalled();
    });

    it('rejects pinning a message from another group', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        makeMessage({ groupId: 'other-group-id' }),
      );

      await expect(
        service.pinMessage(groupId, messageId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(groupsRepository.pinMessage).not.toHaveBeenCalled();
    });
  });

  describe('unpinMessage', () => {
    it('allows the owner to unpin a message', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeMember({ id: 'm-owner', userId, role: 'OWNER' }),
      );
      groupsRepository.findMessageByIdWithRelations.mockResolvedValue(
        makeMessage(),
      );
      groupsRepository.unpinMessage.mockResolvedValue({ count: 1 });

      await service.unpinMessage(groupId, messageId, userId);

      expect(groupsRepository.unpinMessage).toHaveBeenCalledWith(messageId);
      expect(
        websocketEvents.broadcastGroupMessageUnpinned,
      ).toHaveBeenCalledWith(groupId, { id: messageId, groupId });
    });
  });

  describe('listPinnedMessages', () => {
    it('allows any member to list pins', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findPinnedMessages.mockResolvedValue([makePin()]);

      const result = await service.listPinnedMessages(groupId, otherUserId, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].message.id).toBe(messageId);
      expect(result.hasMore).toBe(false);
      expect(groupsRepository.findPinnedMessages).toHaveBeenCalledWith(
        groupId,
        20,
        undefined,
      );
    });

    it('rejects listing pins for a non-member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.listPinnedMessages(groupId, thirdUserId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(groupsRepository.findPinnedMessages).not.toHaveBeenCalled();
    });

    it('paginates pins newest-first and returns a nextCursor', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findPinnedMessages.mockResolvedValue([
        makePin({
          id: 'pin-2',
          pinnedAt: new Date('2026-07-01T12:00:02.000Z'),
        }),
        makePin({
          id: 'pin-1',
          pinnedAt: new Date('2026-07-01T12:00:01.000Z'),
        }),
      ]);

      const result = await service.listPinnedMessages(groupId, otherUserId, {
        limit: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('pin-2');
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('2026-07-01T12:00:02.000Z:pin-2');
    });

    it('batches forwarded-from permission checks for pinned messages', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());
      const pins = [
        makePin({
          id: 'pin-1',
          message: makeMessage({
            id: 'msg-1',
            content: 'first',
            forwardedFrom: {
              sourceType: 'channel',
              sourceChatId: 'other-channel-1',
              sourceMessageId: 'orig-1',
              originalCreatedAt: '2024-01-01T00:00:00Z',
            },
          }),
        }),
        makePin({
          id: 'pin-2',
          message: makeMessage({
            id: 'msg-2',
            content: 'second',
            forwardedFrom: {
              sourceType: 'channel',
              sourceChatId: 'other-channel-2',
              sourceMessageId: 'orig-2',
              originalCreatedAt: '2024-01-01T00:00:00Z',
            },
          }),
        }),
      ];
      groupsRepository.findPinnedMessages.mockResolvedValue(pins);

      await service.listPinnedMessages(groupId, otherUserId, {});

      expect(forwardPermissions.toResponses).toHaveBeenCalledTimes(1);
      expect(forwardPermissions.toResponses).toHaveBeenCalledWith(
        otherUserId,
        pins.map((p) => p.message),
      );
      expect(forwardPermissions.toResponse).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an invalid cursor', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.listPinnedMessages(groupId, otherUserId, {
          cursor: 'not-a-cursor',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
