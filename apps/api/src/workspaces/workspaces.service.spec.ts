import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesRepository } from './workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { ChannelInvitesRepository } from '../channel-invites/channel-invites.repository';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';

type ActiveWorkspace = NonNullable<
  Awaited<ReturnType<WorkspacesRepository['findActiveById']>>
>;
type ListedMember = Awaited<
  ReturnType<WorkspacesRepository['listActiveMembers']>
>[number];
type FoundMember = NonNullable<
  Awaited<ReturnType<WorkspacesRepository['findActiveMemberByUserId']>>
>;
type FoundMemberById = NonNullable<
  Awaited<ReturnType<WorkspacesRepository['findActiveMemberById']>>
>;
type CreatedMember = Awaited<ReturnType<WorkspacesRepository['createMember']>>;
type UpdatedMember = Awaited<
  ReturnType<WorkspacesRepository['updateMemberRole']>
>;
type ListedWorkspace = Awaited<
  ReturnType<WorkspacesRepository['listForUser']>
>[number];
type WorkspaceWithArchive = NonNullable<
  Awaited<ReturnType<WorkspacesRepository['findByIdIncludingArchived']>>
>;
type FoundUser = NonNullable<
  Awaited<ReturnType<UsersRepository['findByUsername']>>
>;
type FoundUserById = NonNullable<
  Awaited<ReturnType<UsersRepository['findById']>>
>;

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let channelsRepository: jest.Mocked<ChannelsRepository>;
  let channelInvitesRepository: jest.Mocked<ChannelInvitesRepository>;
  let auditService: jest.Mocked<AuditService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: WorkspacesRepository,
          useValue: {
            findActiveById: jest.fn(),
            findMemberRole: jest.fn(),
            listActiveMembers: jest.fn(),
            findActiveMemberById: jest.fn(),
            findActiveMemberByUserId: jest.fn(),
            createMember: jest.fn(),
            updateMemberRole: jest.fn(),
            softDeleteMember: jest.fn(),
            softDeleteMemberByUserId: jest.fn(),
            transferOwnership: jest.fn(),
            findByIdIncludingArchived: jest.fn(),
            restoreWorkspace: jest.fn(),
            listArchivedOwnedByUser: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            createUser: jest.fn(),
          },
        },
        {
          provide: ChannelsRepository,
          useValue: {
            softDeleteChannelMembersByWorkspaceAndUserId: jest.fn(),
          },
        },
        {
          provide: ChannelInvitesRepository,
          useValue: {
            softDeletePendingInvitesByWorkspaceAndEmail: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
            listForWorkspace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WorkspacesService);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
    usersRepository = moduleRef.get(UsersRepository);
    channelsRepository = moduleRef.get(ChannelsRepository);
    channelInvitesRepository = moduleRef.get(ChannelInvitesRepository);
    auditService = moduleRef.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const expectAuditNotCalled = () => {
    expect(auditService.record).not.toHaveBeenCalled();
  };

  describe('addMember', () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    const memberId = '55555555-5555-5555-5555-555555555555';

    it('should allow OWNER to add existing user by username', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        username: 'alice',
      } as FoundUser);
      usersRepository.findByEmail.mockResolvedValue(null);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
      workspacesRepository.createMember.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as CreatedMember);

      const result = await service.addMember(workspaceId, userId, {
        identifier: 'alice',
      });

      expect(result.role).toBe('MEMBER');
      expect(result.user.username).toBe('alice');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_ADDED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId,
          role: 'MEMBER',
        },
      });
    });

    it('should allow ADMIN to add existing user', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        username: 'bob',
      } as FoundUser);
      usersRepository.findByEmail.mockResolvedValue(null);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
      workspacesRepository.createMember.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as CreatedMember);

      const result = await service.addMember(workspaceId, userId, {
        identifier: 'bob',
      });

      expect(result.role).toBe('MEMBER');
      expect(result.user.username).toBe('bob');
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.addMember(workspaceId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.addMember(workspaceId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.addMember(workspaceId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject OWNER role', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');

      await expect(
        service.addMember(workspaceId, userId, {
          identifier: 'alice',
          role: 'OWNER',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should default role to MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        username: 'alice',
      } as FoundUser);
      usersRepository.findByEmail.mockResolvedValue(null);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
      workspacesRepository.createMember.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as CreatedMember);

      const result = await service.addMember(workspaceId, userId, {
        identifier: 'alice',
      });

      expect(result.role).toBe('MEMBER');
    });

    it('should allow adding with ADMIN role', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        username: 'alice',
      } as FoundUser);
      usersRepository.findByEmail.mockResolvedValue(null);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
      workspacesRepository.createMember.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as CreatedMember);

      const result = await service.addMember(workspaceId, userId, {
        identifier: 'alice',
        role: 'ADMIN',
      });

      expect(result.role).toBe('ADMIN');
    });

    it('should reject invalid role', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');

      await expect(
        service.addMember(workspaceId, userId, {
          identifier: 'alice',
          role: 'GOD',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should return 404 when user not found', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.addMember(workspaceId, userId, { identifier: 'unknown' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should return 409 when user is already active member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        username: 'alice',
      } as FoundUser);
      usersRepository.findByEmail.mockResolvedValue(null);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'existing-member-id',
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
      } as FoundMember);

      await expect(
        service.addMember(workspaceId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map Prisma P2002 to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({
        id: targetUserId,
        username: 'alice',
      } as FoundUser);
      usersRepository.findByEmail.mockResolvedValue(null);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      workspacesRepository.createMember.mockRejectedValue(prismaError);

      await expect(
        service.addMember(workspaceId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should find user by email when username lookup fails', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue({
        id: targetUserId,
        username: 'alice',
        email: 'alice@example.com',
      } as FoundUser);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
      workspacesRepository.createMember.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as CreatedMember);

      const result = await service.addMember(workspaceId, userId, {
        identifier: 'alice@example.com',
      });

      expect(result.user.username).toBe('alice');
      expect(usersRepository.findByEmail).toHaveBeenCalledWith(
        'alice@example.com',
      );
    });
  });

  describe('transferOwnership', () => {
    const memberId = '33333333-3333-3333-3333-333333333333';
    const targetUserId = '44444444-4444-4444-4444-444444444444';

    it('should allow OWNER to transfer ownership to MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      workspacesRepository.transferOwnership.mockResolvedValue({
        workspaceId,
        previousOwner: { id: userId, userId, role: 'ADMIN' },
        newOwner: { id: memberId, userId: targetUserId, role: 'OWNER' },
      });

      const result = await service.transferOwnership(workspaceId, userId, {
        memberId,
      });

      expect(result.newOwner.role).toBe('OWNER');
      expect(result.previousOwner.role).toBe('ADMIN');
    });

    it('should allow OWNER to transfer ownership to ADMIN', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      workspacesRepository.transferOwnership.mockResolvedValue({
        workspaceId,
        previousOwner: { id: userId, userId, role: 'ADMIN' },
        newOwner: { id: memberId, userId: targetUserId, role: 'OWNER' },
      });

      const result = await service.transferOwnership(workspaceId, userId, {
        memberId,
      });

      expect(result.newOwner.role).toBe('OWNER');
      expect(result.previousOwner.role).toBe('ADMIN');
    });

    it('should reject ADMIN requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject target member from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject deleted target member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject transfer to self', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'owner' },
      } as FoundMemberById);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should reject target already OWNER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'owner' },
      } as FoundMemberById);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should map race condition on old owner to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      workspacesRepository.transferOwnership.mockRejectedValue(
        new Error('OWNERSHIP_STATE_CHANGED'),
      );

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map race condition on target to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      workspacesRepository.transferOwnership.mockRejectedValue(
        new Error('TARGET_STATE_CHANGED'),
      );

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map workspace state change to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      workspacesRepository.transferOwnership.mockRejectedValue(
        new Error('WORKSPACE_STATE_CHANGED'),
      );

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map Prisma P2002 to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      workspacesRepository.transferOwnership.mockRejectedValue(prismaError);

      await expect(
        service.transferOwnership(workspaceId, userId, { memberId }),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should record audit after successful transfer', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: userId,
        workspaceId,
        role: 'OWNER',
        userId,
        user: { id: userId, username: 'owner' },
      } as FoundMember);
      workspacesRepository.transferOwnership.mockResolvedValue({
        workspaceId,
        previousOwner: { id: userId, userId, role: 'ADMIN' },
        newOwner: { id: memberId, userId: targetUserId, role: 'OWNER' },
      });

      const result = await service.transferOwnership(workspaceId, userId, {
        memberId,
      });

      expect(result).toEqual({
        workspaceId,
        previousOwner: { id: userId, userId, role: 'ADMIN' },
        newOwner: { id: memberId, userId: targetUserId, role: 'OWNER' },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_OWNERSHIP_TRANSFERRED,
        entityType: AuditEntityType.WORKSPACE,
        entityId: workspaceId,
        workspaceId,
        metadata: {
          oldOwnerUserId: userId,
          oldOwnerMemberId: userId,
          newOwnerUserId: targetUserId,
          newOwnerMemberId: memberId,
          previousTargetRole: 'MEMBER',
          oldOwnerNewRole: 'ADMIN',
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('listAuditLogs', () => {
    it('should allow OWNER to list audit logs', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      auditService.listForWorkspace.mockResolvedValue([
        {
          id: 'audit-1',
          action: 'workspace.member.role_updated',
          entityType: 'workspace_member',
          entityId: 'member-1',
          workspaceId,
          channelId: null,
          metadata: { oldRole: 'MEMBER', newRole: 'ADMIN' },
          createdAt: new Date('2026-01-01'),
          actor: { id: userId, username: 'owner' },
        },
      ]);

      const result = await service.listAuditLogs(workspaceId, userId, 50);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('workspace.member.role_updated');
      expect(result[0].actor!.username).toBe('owner');
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('should allow ADMIN to list audit logs', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      auditService.listForWorkspace.mockResolvedValue([]);

      const result = await service.listAuditLogs(workspaceId, userId, 50);

      expect(result).toEqual([]);
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.listAuditLogs(workspaceId, userId, 50),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.listAuditLogs(workspaceId, userId, 50),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.listAuditLogs(workspaceId, userId, 50),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should return actor null for system action', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      auditService.listForWorkspace.mockResolvedValue([
        {
          id: 'audit-2',
          action: 'workspace.invite.revoked',
          entityType: 'invitation',
          entityId: 'invite-1',
          workspaceId,
          channelId: null,
          metadata: { role: 'MEMBER' },
          createdAt: new Date('2026-01-01'),
          actor: null,
        },
      ]);

      const result = await service.listAuditLogs(workspaceId, userId, 50);

      expect(result).toHaveLength(1);
      expect(result[0].actor).toBeNull();
    });

    it('should pass limit to audit service', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      auditService.listForWorkspace.mockResolvedValue([]);

      await service.listAuditLogs(workspaceId, userId, 25);

      expect(auditService.listForWorkspace).toHaveBeenCalledWith(
        workspaceId,
        25,
      );
    });
  });

  describe('listMembers', () => {
    it('should allow OWNER to list members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.listActiveMembers.mockResolvedValue([
        {
          id: 'member-1',
          workspaceId,
          role: 'OWNER',
          createdAt: new Date('2026-01-01'),
          user: { id: userId, username: 'owner' },
        },
      ] as ListedMember[]);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('OWNER');
      expect(result[0].user.username).toBe('owner');
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('should allow ADMIN to list members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      workspacesRepository.listActiveMembers.mockResolvedValue([]);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toEqual([]);
    });

    it('should allow MEMBER to list members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      workspacesRepository.listActiveMembers.mockResolvedValue([]);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toEqual([]);
    });

    it('should reject non-member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.listMembers(workspaceId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.listMembers(workspaceId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should only return active members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      workspacesRepository.listActiveMembers.mockResolvedValue([
        {
          id: 'member-1',
          workspaceId,
          role: 'MEMBER',
          createdAt: new Date(),
          user: { id: 'user-1', username: 'alice' },
        },
        {
          id: 'member-2',
          workspaceId,
          role: 'ADMIN',
          createdAt: new Date(),
          user: { id: 'user-2', username: 'bob' },
        },
      ] as ListedMember[]);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].user.username).toBe('alice');
      expect(result[1].user.username).toBe('bob');
    });
  });

  describe('updateMemberRole', () => {
    const memberId = '33333333-3333-3333-3333-333333333333';
    const targetUserId = '44444444-4444-4444-4444-444444444444';

    it('should allow OWNER to promote MEMBER to ADMIN', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.updateMemberRole.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as UpdatedMember);

      const result = await service.updateMemberRole(
        workspaceId,
        memberId,
        { role: 'ADMIN' },
        userId,
      );

      expect(result.role).toBe('ADMIN');
      expect(result.user.username).toBe('alice');
      expect(result).not.toHaveProperty('passwordHash');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId: targetUserId,
          oldRole: 'MEMBER',
          newRole: 'ADMIN',
        },
      });
    });

    it('should allow OWNER to demote ADMIN to MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as FoundMemberById);
      workspacesRepository.updateMemberRole.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as UpdatedMember);

      const result = await service.updateMemberRole(
        workspaceId,
        memberId,
        { role: 'MEMBER' },
        userId,
      );

      expect(result.role).toBe('MEMBER');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId: targetUserId,
          oldRole: 'ADMIN',
          newRole: 'MEMBER',
        },
      });
    });

    it('should reject ADMIN requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject target member from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject deleted target member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject changing role of current OWNER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'owner' },
      } as FoundMemberById);

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'ADMIN' },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should reject OWNER role in body', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);

      await expect(
        service.updateMemberRole(
          workspaceId,
          memberId,
          { role: 'OWNER' },
          userId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should return updated member without passwordHash', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.updateMemberRole.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as UpdatedMember);

      const result = await service.updateMemberRole(
        workspaceId,
        memberId,
        { role: 'ADMIN' },
        userId,
      );

      expect(result).toEqual({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        joinedAt: expect.any(Date) as Date,
        user: {
          id: targetUserId,
          username: 'alice',
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_ROLE_UPDATED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId: targetUserId,
          oldRole: 'MEMBER',
          newRole: 'ADMIN',
        },
      });
    });
  });

  describe('removeMember', () => {
    const memberId = '33333333-3333-3333-3333-333333333333';
    const targetUserId = '44444444-4444-4444-4444-444444444444';

    it('should allow OWNER to remove MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue({
        id: targetUserId,
        email: 'alice@example.com',
      } as FoundUserById);
      channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId.mockResolvedValue(
        1,
      );
      channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail.mockResolvedValue(
        0,
      );

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result).toEqual({ success: true });
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, targetUserId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).toHaveBeenCalledWith(workspaceId, 'alice@example.com');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_REMOVED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId: targetUserId,
          removedRole: 'MEMBER',
        },
      });
    });

    it('should allow OWNER to remove ADMIN', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as FoundMemberById);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue({
        id: targetUserId,
        email: 'bob@example.com',
      } as FoundUserById);
      channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId.mockResolvedValue(
        1,
      );
      channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail.mockResolvedValue(
        0,
      );

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result).toEqual({ success: true });
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, targetUserId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).toHaveBeenCalledWith(workspaceId, 'bob@example.com');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_REMOVED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId: targetUserId,
          removedRole: 'ADMIN',
        },
      });
    });

    it('should allow ADMIN to remove MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue({
        id: targetUserId,
        email: 'alice@example.com',
      } as FoundUserById);
      channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId.mockResolvedValue(
        1,
      );
      channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail.mockResolvedValue(
        0,
      );

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result).toEqual({ success: true });
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, targetUserId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).toHaveBeenCalledWith(workspaceId, 'alice@example.com');
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_MEMBER_REMOVED,
        entityType: AuditEntityType.WORKSPACE_MEMBER,
        entityId: memberId,
        workspaceId,
        metadata: {
          targetUserId: targetUserId,
          removedRole: 'MEMBER',
        },
      });
    });

    it('should reject ADMIN removing ADMIN', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as FoundMemberById);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject ADMIN removing OWNER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'owner' },
      } as FoundMemberById);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject target member from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject already deleted target member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject removing workspace OWNER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'owner' },
      } as FoundMemberById);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should reject self-removal', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'owner' },
      } as FoundMemberById);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should reject when soft delete affects 0 rows', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.softDeleteMember.mockResolvedValue(0);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).not.toHaveBeenCalled();
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).not.toHaveBeenCalled();
    });

    it('should still cleanup channel memberships when target user is not found', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as FoundMemberById);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue(null);

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result).toEqual({ success: true });
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, targetUserId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should allow OWNER to restore archived workspace', async () => {
      workspacesRepository.findByIdIncludingArchived
        .mockResolvedValueOnce({
          id: workspaceId,
          name: 'Archived WS',
          ownerId: userId,
          deletedAt: new Date('2026-01-01'),
        } as WorkspaceWithArchive)
        .mockResolvedValueOnce({
          id: workspaceId,
          name: 'Archived WS',
          ownerId: userId,
          deletedAt: null,
        } as WorkspaceWithArchive);
      workspacesRepository.restoreWorkspace.mockResolvedValue(1);

      const result = await service.restore(workspaceId, userId);

      expect(result).not.toBeNull();
      expect(result!.deletedAt).toBeNull();
      expect(workspacesRepository.restoreWorkspace).toHaveBeenCalledWith(
        workspaceId,
      );
    });

    it('should reject non-owner', async () => {
      workspacesRepository.findByIdIncludingArchived.mockResolvedValue({
        id: workspaceId,
        name: 'Archived WS',
        ownerId: 'other-owner-id',
        deletedAt: new Date('2026-01-01'),
      } as WorkspaceWithArchive);

      await expect(service.restore(workspaceId, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(workspacesRepository.restoreWorkspace).not.toHaveBeenCalled();
      expectAuditNotCalled();
    });

    it('should reject not found workspace', async () => {
      workspacesRepository.findByIdIncludingArchived.mockResolvedValue(null);

      await expect(service.restore(workspaceId, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(workspacesRepository.restoreWorkspace).not.toHaveBeenCalled();
      expectAuditNotCalled();
    });

    it('should reject active workspace', async () => {
      workspacesRepository.findByIdIncludingArchived.mockResolvedValue({
        id: workspaceId,
        name: 'Active WS',
        ownerId: userId,
        deletedAt: null,
      } as WorkspaceWithArchive);

      await expect(service.restore(workspaceId, userId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(workspacesRepository.restoreWorkspace).not.toHaveBeenCalled();
      expectAuditNotCalled();
    });

    it('should reject race condition where restore affects 0 rows', async () => {
      workspacesRepository.findByIdIncludingArchived.mockResolvedValue({
        id: workspaceId,
        name: 'Archived WS',
        ownerId: userId,
        deletedAt: new Date('2026-01-01'),
      } as WorkspaceWithArchive);
      workspacesRepository.restoreWorkspace.mockResolvedValue(0);

      await expect(service.restore(workspaceId, userId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expectAuditNotCalled();
    });
  });

  describe('leaveWorkspace', () => {
    it('should allow MEMBER to leave workspace and cleanup channel access', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'member-id',
        workspaceId,
        role: 'MEMBER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'alice' },
      } as FoundMember);
      workspacesRepository.softDeleteMemberByUserId.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        email: 'alice@example.com',
      } as FoundUserById);
      channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId.mockResolvedValue(
        2,
      );
      channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail.mockResolvedValue(
        1,
      );

      const result = await service.leaveWorkspace(workspaceId, userId);

      expect(result).toEqual({ success: true });
      expect(
        workspacesRepository.softDeleteMemberByUserId,
      ).toHaveBeenCalledWith(workspaceId, userId);
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, userId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).toHaveBeenCalledWith(workspaceId, 'alice@example.com');
    });

    it('should allow ADMIN to leave workspace and cleanup channel access', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'member-id',
        workspaceId,
        role: 'ADMIN',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'alice' },
      } as FoundMember);
      workspacesRepository.softDeleteMemberByUserId.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue({
        id: userId,
        email: 'alice@example.com',
      } as FoundUserById);
      channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId.mockResolvedValue(
        2,
      );
      channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail.mockResolvedValue(
        0,
      );

      const result = await service.leaveWorkspace(workspaceId, userId);

      expect(result).toEqual({ success: true });
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, userId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).toHaveBeenCalledWith(workspaceId, 'alice@example.com');
    });

    it('should reject OWNER leaving workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'member-id',
        workspaceId,
        role: 'OWNER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'alice' },
      } as FoundMember);

      await expect(
        service.leaveWorkspace(workspaceId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        workspacesRepository.softDeleteMemberByUserId,
      ).not.toHaveBeenCalled();
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('should reject non-workspace-member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);

      await expect(
        service.leaveWorkspace(workspaceId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        workspacesRepository.softDeleteMemberByUserId,
      ).not.toHaveBeenCalled();
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('should reject non-existing workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.leaveWorkspace(workspaceId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        workspacesRepository.softDeleteMemberByUserId,
      ).not.toHaveBeenCalled();
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('should reject when soft delete affects 0 rows', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'member-id',
        workspaceId,
        role: 'MEMBER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'alice' },
      } as FoundMember);
      workspacesRepository.softDeleteMemberByUserId.mockResolvedValue(0);

      await expect(
        service.leaveWorkspace(workspaceId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).not.toHaveBeenCalled();
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).not.toHaveBeenCalled();
    });

    it('should still cleanup channel memberships when user is not found', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({
        id: workspaceId,
      } as ActiveWorkspace);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'member-id',
        workspaceId,
        role: 'MEMBER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'alice' },
      } as FoundMember);
      workspacesRepository.softDeleteMemberByUserId.mockResolvedValue(1);
      usersRepository.findById.mockResolvedValue(null);

      const result = await service.leaveWorkspace(workspaceId, userId);

      expect(result).toEqual({ success: true });
      expect(
        channelsRepository.softDeleteChannelMembersByWorkspaceAndUserId,
      ).toHaveBeenCalledWith(workspaceId, userId);
      expect(
        channelInvitesRepository.softDeletePendingInvitesByWorkspaceAndEmail,
      ).not.toHaveBeenCalled();
    });
  });

  describe('listArchivedForOwner', () => {
    it('should return only own archived workspaces', async () => {
      workspacesRepository.listArchivedOwnedByUser.mockResolvedValue([
        {
          id: 'ws-arch',
          name: 'Old',
          slug: 'old',
          ownerId: userId,
          deletedAt: new Date('2026-01-01'),
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2026-01-01'),
        } as ListedWorkspace,
      ]);

      const result = await service.listArchivedForOwner(userId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ws-arch');
      expect(workspacesRepository.listArchivedOwnedByUser).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should return empty array when no archived workspaces', async () => {
      workspacesRepository.listArchivedOwnedByUser.mockResolvedValue([]);

      const result = await service.listArchivedForOwner(userId);

      expect(result).toEqual([]);
    });

    it('should not include active workspaces', async () => {
      workspacesRepository.listArchivedOwnedByUser.mockResolvedValue([
        {
          id: 'ws-arch',
          name: 'Old',
          slug: 'old',
          ownerId: userId,
          deletedAt: new Date('2026-01-01'),
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2026-01-01'),
        } as ListedWorkspace,
      ]);

      const result = await service.listArchivedForOwner(userId);

      expect(result.every((ws) => ws.deletedAt !== null)).toBe(true);
    });

    it('should not include archived workspaces owned by another user', async () => {
      workspacesRepository.listArchivedOwnedByUser.mockResolvedValue([]);

      const result = await service.listArchivedForOwner(userId);

      expect(result).toEqual([]);
    });
  });
});
