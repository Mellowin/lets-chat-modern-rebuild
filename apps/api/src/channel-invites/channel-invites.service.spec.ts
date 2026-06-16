import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ChannelType,
  ChannelRole,
  WorkspaceRole,
} from '@lets-chat/database';
import { ChannelInvitesService } from './channel-invites.service';
import { ChannelInvitesRepository } from './channel-invites.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';

describe('ChannelInvitesService', () => {
  let service: ChannelInvitesService;
  let channelInvitesRepository: jest.Mocked<ChannelInvitesRepository>;
  let channelsRepository: jest.Mocked<ChannelsRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let auditService: jest.Mocked<AuditService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const channelId = '33333333-3333-3333-3333-333333333333';
  const targetUserId = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChannelInvitesService,
        {
          provide: ChannelInvitesRepository,
          useValue: {
            createInvite: jest.fn(),
            findByTokenHash: jest.fn(),
            findById: jest.fn(),
            findPendingById: jest.fn(),
            findPendingByEmail: jest.fn(),
            findPendingByChannelAndEmail: jest.fn(),
            acceptInvite: jest.fn(),
            softDeleteIfUnused: jest.fn(),
            listForChannel: jest.fn(),
          },
        },
        {
          provide: ChannelsRepository,
          useValue: {
            findActiveById: jest.fn(),
            findChannelMemberRole: jest.fn(),
            findActiveChannelMemberByUserId: jest.fn(),
          },
        },
        {
          provide: WorkspacesRepository,
          useValue: {
            findActiveById: jest.fn(),
            findMemberRole: jest.fn(),
            findActiveMemberByUserId: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ChannelInvitesService);
    channelInvitesRepository = moduleRef.get(ChannelInvitesRepository);
    channelsRepository = moduleRef.get(ChannelsRepository);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
    usersRepository = moduleRef.get(UsersRepository);
    auditService = moduleRef.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  type FoundWorkspace = NonNullable<
    Awaited<ReturnType<WorkspacesRepository['findActiveById']>>
  >;
  type FoundChannel = NonNullable<
    Awaited<ReturnType<ChannelsRepository['findActiveById']>>
  >;
  type FoundUser = NonNullable<
    Awaited<ReturnType<UsersRepository['findByUsername']>>
  >;
  type FoundWorkspaceMember = NonNullable<
    Awaited<ReturnType<WorkspacesRepository['findActiveMemberByUserId']>>
  >;
  type FoundChannelMember = NonNullable<
    Awaited<ReturnType<ChannelsRepository['findActiveChannelMemberByUserId']>>
  >;
  type CreatedChannelInvite = Awaited<
    ReturnType<ChannelInvitesRepository['createInvite']>
  >;

  function mockWorkspace(
    overrides: Partial<FoundWorkspace> = {},
  ): FoundWorkspace {
    return {
      id: workspaceId,
      name: 'Test Workspace',
      slug: 'test-workspace',
      description: null,
      ownerId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      permanentlyDeletedAt: null,
      ...overrides,
    };
  }

  function mockChannel(overrides: Partial<FoundChannel> = {}): FoundChannel {
    return {
      id: channelId,
      workspaceId,
      name: 'general',
      slug: 'general',
      description: null,
      type: ChannelType.PUBLIC,
      createdById: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      permanentlyDeletedAt: null,
      ...overrides,
    };
  }

  function mockUser(overrides: Partial<FoundUser> = {}): FoundUser {
    return {
      id: targetUserId,
      email: 'bob@example.com',
      username: 'bob',
      passwordHash: 'hash',
      displayName: null,
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
      ...overrides,
    };
  }

  function mockWorkspaceMember(
    overrides: Partial<FoundWorkspaceMember> = {},
  ): FoundWorkspaceMember {
    return {
      id: 'wm1',
      workspaceId,
      userId: targetUserId,
      role: WorkspaceRole.MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      user: { id: targetUserId, username: 'bob', avatarUrl: null },
      ...overrides,
    };
  }

  function mockChannelMember(
    overrides: Partial<FoundChannelMember> = {},
  ): FoundChannelMember {
    return {
      id: 'cm1',
      channelId,
      userId: targetUserId,
      role: ChannelRole.MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      user: { id: targetUserId, username: 'bob', avatarUrl: null },
      ...overrides,
    };
  }

  function mockChannelInvitation(
    overrides: Partial<CreatedChannelInvite> = {},
  ): CreatedChannelInvite {
    return {
      id: 'invite-id',
      workspaceId,
      channelId,
      invitedById: userId,
      invitedEmail: 'bob@example.com',
      role: ChannelRole.MEMBER,
      tokenHash: 'hash',
      expiresAt: new Date('2026-12-31'),
      usedAt: null,
      usedById: null,
      deletedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  type PendingChannelInviteWithRelations = NonNullable<
    Awaited<ReturnType<ChannelInvitesRepository['findPendingById']>>
  >;
  type AcceptedChannelMember = Awaited<
    ReturnType<ChannelInvitesRepository['acceptInvite']>
  >;

  function mockPendingChannelInvite(
    overrides: Partial<PendingChannelInviteWithRelations> = {},
  ): PendingChannelInviteWithRelations {
    return {
      id: 'invite-1',
      workspaceId,
      channelId,
      invitedById: userId,
      invitedEmail: 'alice@example.com',
      role: ChannelRole.MEMBER,
      tokenHash: 'hash',
      expiresAt: new Date('2026-12-31'),
      usedAt: null,
      usedById: null,
      deletedAt: null,
      createdAt: new Date(),
      workspace: { id: workspaceId, name: 'Test', slug: 'test' },
      channel: { id: channelId, name: 'general', slug: 'general' },
      invitedBy: { id: userId, username: 'alice', displayName: 'Alice' },
      ...overrides,
    };
  }

  function mockAcceptedChannelMember(
    overrides: Partial<AcceptedChannelMember> = {},
  ): AcceptedChannelMember {
    return {
      id: 'cm-accepted',
      channelId,
      userId,
      role: ChannelRole.MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    };
  }

  function mockOwnerSetup() {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    channelsRepository.findActiveById.mockResolvedValue(mockChannel());
    channelsRepository.findChannelMemberRole.mockResolvedValue(
      ChannelRole.OWNER,
    );
  }

  function mockAdminSetup() {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.ADMIN);
    channelsRepository.findActiveById.mockResolvedValue(mockChannel());
    channelsRepository.findChannelMemberRole.mockResolvedValue(
      ChannelRole.ADMIN,
    );
  }

  function mockMemberSetup() {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.MEMBER);
    channelsRepository.findActiveById.mockResolvedValue(mockChannel());
    channelsRepository.findChannelMemberRole.mockResolvedValue(
      ChannelRole.MEMBER,
    );
  }

  describe('create', () => {
    it('should allow OWNER to create channel invite by username', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue(
        mockChannelInvitation(),
      );

      const result = await service.create(
        workspaceId,
        channelId,
        { identifier: 'bob', role: 'MEMBER' },
        userId,
      );

      expect(result.email).toBe('bob@example.com');
      expect(result.role).toBe('MEMBER');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANNEL_INVITE_CREATED,
          entityType: AuditEntityType.CHANNEL_INVITATION,
        }),
      );
    });

    it('should allow re-inviting after previous invite was accepted and member removed', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue(
        mockChannelInvitation({ id: 'invite-id-2', tokenHash: 'hash2' }),
      );

      const result = await service.create(
        workspaceId,
        channelId,
        { identifier: 'bob', role: 'MEMBER' },
        userId,
      );

      expect(result.id).toBe('invite-id-2');
      expect(
        channelInvitesRepository.findPendingByChannelAndEmail,
      ).toHaveBeenCalledWith(channelId, 'bob@example.com');
    });

    it('should allow OWNER to create channel invite by email for existing workspace member', async () => {
      mockOwnerSetup();
      usersRepository.findByEmail.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue(
        mockChannelInvitation(),
      );

      const result = await service.create(
        workspaceId,
        channelId,
        { email: 'bob@example.com', role: 'MEMBER' },
        userId,
      );

      expect(result.email).toBe('bob@example.com');
    });

    it('should allow ADMIN to create MEMBER channel invite', async () => {
      mockAdminSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue(
        mockChannelInvitation(),
      );

      const result = await service.create(
        workspaceId,
        channelId,
        { identifier: 'bob', role: 'MEMBER' },
        userId,
      );

      expect(result.role).toBe('MEMBER');
    });

    it('should reject ADMIN creating ADMIN channel invite', async () => {
      mockAdminSetup();

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'bob', role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject OWNER role assignment in channel invite', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'bob', role: 'OWNER' as 'ADMIN' | 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(channelInvitesRepository.createInvite).not.toHaveBeenCalled();
    });

    it('should reject MEMBER creating channel invite', async () => {
      mockMemberSetup();

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'bob', role: 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should block duplicate pending channel invite', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        mockChannelInvitation({ id: 'existing' }),
      );

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'bob', role: 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should block invite for existing active channel member', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
        mockWorkspaceMember(),
      );
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        mockChannelMember(),
      );

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'bob', role: 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should return 404 for unknown username', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(null);

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'nobody', role: 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should error when user is not active workspace member', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue(mockUser());
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);

      await expect(
        service.create(
          workspaceId,
          channelId,
          { identifier: 'bob', role: 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should error when email user is not active workspace member', async () => {
      mockOwnerSetup();
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.create(
          workspaceId,
          channelId,
          { email: 'unknown@example.com', role: 'MEMBER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listPending', () => {
    it('should return current user pending channel invites', async () => {
      channelInvitesRepository.findPendingByEmail.mockResolvedValue([
        mockPendingChannelInvite({
          id: 'invite-1',
          invitedEmail: 'alice@example.com',
          workspace: { id: workspaceId, name: 'Test', slug: 'test' },
          channel: { id: channelId, name: 'general', slug: 'general' },
          invitedBy: { id: userId, username: 'alice', displayName: 'Alice' },
          expiresAt: new Date('2026-12-31'),
          createdAt: new Date('2026-01-01'),
        }),
      ]);

      const result = await service.listPending(userId, 'alice@example.com');

      expect(result).toHaveLength(1);
      expect(result[0].workspace.name).toBe('Test');
      expect(result[0].channel.name).toBe('general');
    });
  });

  describe('acceptById', () => {
    it('should create ChannelMember on accept', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );
      channelsRepository.findActiveById.mockResolvedValue(mockChannel());
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);
      channelInvitesRepository.acceptInvite.mockResolvedValue(
        mockAcceptedChannelMember({ createdAt: new Date('2026-01-01') }),
      );

      const result = await service.acceptById(
        'invite-1',
        userId,
        'alice@example.com',
      );

      expect(result.role).toBe('MEMBER');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANNEL_INVITE_ACCEPTED,
          entityType: AuditEntityType.CHANNEL_INVITATION,
        }),
      );
    });

    it('should reject accept for OWNER role invite', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite({ role: ChannelRole.OWNER }),
      );

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should reject accept when channel is not active', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );
      channelsRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject accept when channel belongs to another workspace', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );
      channelsRepository.findActiveById.mockResolvedValue(
        mockChannel({ workspaceId: 'other-workspace-id' }),
      );

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject accept when user is not workspace member', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      channelsRepository.findActiveById.mockResolvedValue(mockChannel());

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject accept when already channel member', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );
      channelsRepository.findActiveById.mockResolvedValue(mockChannel());
      channelsRepository.findChannelMemberRole.mockResolvedValue(
        ChannelRole.MEMBER,
      );

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject accept when invite already used', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite({ usedAt: new Date(), usedById: 'other' }),
      );

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should map race condition on accept to conflict', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );
      channelsRepository.findActiveById.mockResolvedValue(mockChannel());
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);
      channelInvitesRepository.acceptInvite.mockRejectedValue(
        new Error('INVITE_ALREADY_USED_OR_REVOKED'),
      );
      channelInvitesRepository.findById.mockResolvedValue(
        mockChannelInvitation({
          id: 'invite-1',
          usedAt: new Date(),
          usedById: 'other',
        }),
      );

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should map Prisma P2002 to conflict on accept', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );
      channelsRepository.findActiveById.mockResolvedValue(mockChannel());
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        { code: 'P2002', clientVersion: '5' },
      );
      channelInvitesRepository.acceptInvite.mockRejectedValue(prismaError);

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decline', () => {
    it('should soft-delete invite on decline', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite(),
      );
      channelInvitesRepository.softDeleteIfUnused.mockResolvedValue(1);

      const result = await service.decline(
        'invite-1',
        userId,
        'alice@example.com',
      );

      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANNEL_INVITE_DECLINED,
          entityType: AuditEntityType.CHANNEL_INVITATION,
        }),
      );
    });

    it('should reject declining already used invite', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue(
        mockPendingChannelInvite({ usedAt: new Date(), usedById: 'other' }),
      );

      await expect(
        service.decline('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
