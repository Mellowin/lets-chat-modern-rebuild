import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import {
  GroupsRepository,
  GroupWithMembersAndLastMessage,
  GroupMessageWithAuthor,
} from './groups.repository';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PushService } from '../push/push.service';

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
) {
  const base: Awaited<ReturnType<UsersRepository['findById']>> = {
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
  };
  return { ...base, ...overrides };
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
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: userId,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
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
            touchUpdatedAt: jest.fn(),
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
          },
        },
        {
          provide: PushService,
          useValue: {
            notifyGroupMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(GroupsService);
    groupsRepository = moduleRef.get(GroupsRepository);
    usersRepository = moduleRef.get(UsersRepository);
    websocketEvents = moduleRef.get(WebsocketEventsService);
    pushService = moduleRef.get(PushService);
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

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hi team');
      expect(groupsRepository.listMessages).toHaveBeenCalledWith(groupId);
    });

    it('throws NotFoundException for a non-member', async () => {
      groupsRepository.findById.mockResolvedValue(makeGroup());

      await expect(
        service.listMessages(groupId, thirdUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(groupsRepository.listMessages).not.toHaveBeenCalled();
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
      });
      expect(groupsRepository.touchUpdatedAt).toHaveBeenCalledWith(groupId);
      expect(websocketEvents.broadcastGroupMessageCreated).toHaveBeenCalledWith(
        groupId,
        objectContaining({
          id: messageId,
          groupId,
          content: 'Hello everyone!',
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
  });
});
