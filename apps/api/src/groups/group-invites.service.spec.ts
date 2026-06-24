import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { GroupInvitesService } from './group-invites.service';
import { GroupsRepository } from './groups.repository';
import { GroupInvitesRepository } from './group-invites.repository';
import { GroupsService } from './groups.service';
import { WebsocketEventsService } from '../websocket/websocket-events.service';

const userId = '11111111-1111-1111-1111-111111111111';
const otherUserId = '22222222-2222-2222-2222-222222222222';
const groupId = '44444444-4444-4444-4444-444444444444';
const inviteId = '66666666-6666-6666-6666-666666666666';

function makeGroup(archived = false) {
  return {
    id: groupId,
    name: 'Test group',
    createdById: userId,
    archivedAt: archived ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [
      {
        id: 'm-owner',
        groupId,
        userId,
        user: {
          id: userId,
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
        },
        role: 'OWNER' as const,
        joinedAt: new Date(),
        lastReadAt: null,
        leftAt: null,
      },
      {
        id: 'm-other',
        groupId,
        userId: otherUserId,
        user: {
          id: otherUserId,
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
        role: 'MEMBER' as const,
        joinedAt: new Date(),
        lastReadAt: null,
        leftAt: null,
      },
    ],
    messages: [],
  };
}

function makeActiveMember(role: 'OWNER' | 'MEMBER', memberUserId = userId) {
  return {
    id: `m-${role.toLowerCase()}`,
    groupId,
    userId: memberUserId,
    role,
    joinedAt: new Date(),
    lastReadAt: null,
    leftAt: null,
  };
}

function makeInvite(
  overrides: Partial<
    NonNullable<Awaited<ReturnType<GroupInvitesRepository['findByTokenHash']>>>
  > = {},
): NonNullable<Awaited<ReturnType<GroupInvitesRepository['findByTokenHash']>>> {
  const base = {
    id: inviteId,
    groupId,
    tokenHash: 'hash',
    createdById: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    revokedAt: null,
    maxUses: null,
    useCount: 0,
    roleOnJoin: 'MEMBER' as const,
    group: {
      id: groupId,
      name: 'Test group',
      archivedAt: null,
    },
  };
  return { ...base, ...overrides };
}

describe('GroupInvitesService', () => {
  let service: GroupInvitesService;
  let groupsRepository: jest.Mocked<GroupsRepository>;
  let groupInvitesRepository: jest.Mocked<GroupInvitesRepository>;
  let groupsService: jest.Mocked<GroupsService>;
  let websocketEvents: jest.Mocked<WebsocketEventsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GroupInvitesService,
        {
          provide: GroupsRepository,
          useValue: {
            findActiveMember: jest.fn(),
            findById: jest.fn(),
            addMember: jest.fn(),
          },
        },
        {
          provide: GroupInvitesRepository,
          useValue: {
            createInvite: jest.fn(),
            findByTokenHash: jest.fn(),
            findById: jest.fn(),
            listForGroup: jest.fn(),
            revokeInvite: jest.fn(),
            incrementUseCount: jest.fn(),
          },
        },
        {
          provide: GroupsService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: WebsocketEventsService,
          useValue: {
            broadcastGroupConversationUpdated: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(GroupInvitesService);
    groupsRepository = moduleRef.get(GroupsRepository);
    groupInvitesRepository = moduleRef.get(GroupInvitesRepository);
    groupsService = moduleRef.get(GroupsService);
    websocketEvents = moduleRef.get(WebsocketEventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvite', () => {
    it('allows the owner to create an invite link', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeActiveMember('OWNER'),
      );
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupInvitesRepository.createInvite.mockResolvedValue(makeInvite());

      const result = await service.createInvite(groupId, {}, userId);

      expect(result.token).toHaveLength(64);
      expect(result.groupId).toBe(groupId);
      expect(groupInvitesRepository.createInvite).toHaveBeenCalled();
    });

    it('forbids non-owners from creating invite links', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeActiveMember('MEMBER', otherUserId),
      );

      await expect(
        service.createInvite(groupId, {}, otherUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects invites for archived groups', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeActiveMember('OWNER'),
      );
      groupsRepository.findById.mockResolvedValue(makeGroup(true));

      await expect(
        service.createInvite(groupId, {}, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revokeInvite', () => {
    it('allows the owner to revoke an invite', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeActiveMember('OWNER'),
      );
      groupInvitesRepository.findById.mockResolvedValue(makeInvite());
      groupInvitesRepository.revokeInvite.mockResolvedValue(1);

      const result = await service.revokeInvite(groupId, inviteId, userId);

      expect(result.revokedAt).toBeInstanceOf(Date);
    });

    it('forbids non-owners from revoking invites', async () => {
      groupsRepository.findActiveMember.mockResolvedValue(
        makeActiveMember('MEMBER', otherUserId),
      );

      await expect(
        service.revokeInvite(groupId, inviteId, otherUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('preview', () => {
    it('returns valid for a fresh invite', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(makeInvite());

      const result = await service.preview('token');

      expect(result.valid).toBe(true);
      expect(result.groupName).toBe('Test group');
    });

    it('returns invalid for a revoked invite', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({ revokedAt: new Date() }),
      );

      const result = await service.preview('token');

      expect(result.valid).toBe(false);
    });

    it('throws NotFoundException for an unknown token', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(null);

      await expect(service.preview('token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('accept', () => {
    it('adds a new member and returns the group', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(makeInvite());
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findActiveMember.mockResolvedValue(null);
      groupsRepository.addMember.mockResolvedValue({
        id: 'm-new',
        groupId,
        userId: otherUserId,
        role: 'MEMBER',
        joinedAt: new Date(),
        lastReadAt: null,
        leftAt: null,
      });
      groupsService.get.mockResolvedValue({
        id: groupId,
        members: [],
      } as unknown as Awaited<ReturnType<GroupsService['get']>>);

      await service.accept('token', otherUserId);

      expect(groupsRepository.addMember).toHaveBeenCalledWith(
        groupId,
        otherUserId,
      );
      expect(groupInvitesRepository.incrementUseCount).toHaveBeenCalledWith(
        inviteId,
      );
      expect(
        websocketEvents.broadcastGroupConversationUpdated,
      ).toHaveBeenCalled();
    });

    it('returns the group for an existing member without incrementing use count', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(makeInvite());
      groupsRepository.findById.mockResolvedValue(makeGroup());
      groupsRepository.findActiveMember.mockResolvedValue(
        makeActiveMember('MEMBER', otherUserId),
      );
      groupsService.get.mockResolvedValue({
        id: groupId,
        members: [],
      } as unknown as Awaited<ReturnType<GroupsService['get']>>);

      await service.accept('token', otherUserId);

      expect(groupsRepository.addMember).not.toHaveBeenCalled();
      expect(groupInvitesRepository.incrementUseCount).not.toHaveBeenCalled();
    });

    it('rejects revoked invites', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({ revokedAt: new Date() }),
      );

      await expect(service.accept('token', otherUserId)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('rejects expired invites', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(service.accept('token', otherUserId)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('rejects invites for archived groups', async () => {
      groupInvitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({
          group: {
            id: groupId,
            name: 'Test',
            archivedAt: new Date(),
          },
        }),
      );
      groupsRepository.findById.mockResolvedValue(makeGroup(true));

      await expect(service.accept('token', otherUserId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
