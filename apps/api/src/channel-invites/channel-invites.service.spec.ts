import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { ChannelInvitesService } from './channel-invites.service';
import { ChannelInvitesRepository } from './channel-invites.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.constants';

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

  function mockOwnerSetup() {
    workspacesRepository.findActiveById.mockResolvedValue({
      id: workspaceId,
    } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
    channelsRepository.findActiveById.mockResolvedValue({
      id: channelId,
      workspaceId,
    } as any);
    channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
  }

  function mockAdminSetup() {
    workspacesRepository.findActiveById.mockResolvedValue({
      id: workspaceId,
    } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
    channelsRepository.findActiveById.mockResolvedValue({
      id: channelId,
      workspaceId,
    } as any);
    channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
  }

  function mockMemberSetup() {
    workspacesRepository.findActiveById.mockResolvedValue({
      id: workspaceId,
    } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
    channelsRepository.findActiveById.mockResolvedValue({
      id: channelId,
      workspaceId,
    } as any);
    channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
  }

  describe('create', () => {
    it('should allow OWNER to create channel invite by username', async () => {
      mockOwnerSetup();
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
        username: 'bob',
      } as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'wm1',
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue({
        id: 'invite-id',
        workspaceId,
        channelId,
        invitedEmail: 'bob@example.com',
        role: 'MEMBER',
        tokenHash: 'hash',
        expiresAt: new Date('2026-12-31'),
        createdAt: new Date(),
      } as any);

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
        }),
      );
    });

    it('should allow OWNER to create channel invite by email for existing workspace member', async () => {
      mockOwnerSetup();
      usersRepository.findByEmail.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
        username: 'bob',
      } as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'wm1',
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue({
        id: 'invite-id',
        workspaceId,
        channelId,
        invitedEmail: 'bob@example.com',
        role: 'MEMBER',
        tokenHash: 'hash',
        expiresAt: new Date('2026-12-31'),
        createdAt: new Date(),
      } as any);

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
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
        username: 'bob',
      } as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'wm1',
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue(
        null,
      );
      channelInvitesRepository.createInvite.mockResolvedValue({
        id: 'invite-id',
        workspaceId,
        channelId,
        invitedEmail: 'bob@example.com',
        role: 'MEMBER',
        tokenHash: 'hash',
        expiresAt: new Date('2026-12-31'),
        createdAt: new Date(),
      } as any);

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
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
        username: 'bob',
      } as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'wm1',
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(
        null,
      );
      channelInvitesRepository.findPendingByChannelAndEmail.mockResolvedValue({
        id: 'existing',
      } as any);

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
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
        username: 'bob',
      } as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'wm1',
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue({
        id: 'cm1',
      } as any);

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
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
        username: 'bob',
      } as any);
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
        {
          id: 'invite-1',
          workspace: { id: workspaceId, name: 'Test', slug: 'test' },
          channel: { id: channelId, name: 'general', slug: 'general' },
          invitedBy: { id: userId, username: 'alice', displayName: 'Alice' },
          role: 'MEMBER',
          expiresAt: new Date('2026-12-31'),
          createdAt: new Date('2026-01-01'),
        },
      ] as any);

      const result = await service.listPending(userId, 'alice@example.com');

      expect(result).toHaveLength(1);
      expect(result[0].workspace.name).toBe('Test');
      expect(result[0].channel.name).toBe('general');
    });
  });

  describe('acceptById', () => {
    it('should create ChannelMember on accept', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: null,
        usedById: null,
      } as any);
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);
      channelInvitesRepository.acceptInvite.mockResolvedValue({
        channelId,
        userId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      } as any);

      const result = await service.acceptById(
        'invite-1',
        userId,
        'alice@example.com',
      );

      expect(result.role).toBe('MEMBER');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANNEL_INVITE_ACCEPTED,
        }),
      );
    });

    it('should reject accept when user is not workspace member', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: null,
        usedById: null,
      } as any);
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject accept when already channel member', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: null,
        usedById: null,
      } as any);
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject accept when invite already used', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: new Date(),
        usedById: 'other',
      } as any);

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should map race condition on accept to conflict', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: null,
        usedById: null,
      } as any);
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);
      channelInvitesRepository.acceptInvite.mockRejectedValue(
        new Error('INVITE_ALREADY_USED_OR_REVOKED'),
      );
      channelInvitesRepository.findById.mockResolvedValue({
        id: 'invite-1',
        usedAt: new Date(),
        usedById: 'other',
      } as any);

      await expect(
        service.acceptById('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should map Prisma P2002 to conflict on accept', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: null,
        usedById: null,
      } as any);
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
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
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: null,
        usedById: null,
      } as any);
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
        }),
      );
    });

    it('should reject declining already used invite', async () => {
      channelInvitesRepository.findPendingById.mockResolvedValue({
        id: 'invite-1',
        workspaceId,
        channelId,
        invitedEmail: 'alice@example.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-12-31'),
        deletedAt: null,
        usedAt: new Date(),
        usedById: 'other',
      } as any);

      await expect(
        service.decline('invite-1', userId, 'alice@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
