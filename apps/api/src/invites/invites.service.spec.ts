import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@lets-chat/database';
import { createHash } from 'crypto';
import { InvitesService } from './invites.service';

import { InvitesRepository } from './invites.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';

describe('InvitesService', () => {
  let service: InvitesService;
  let invitesRepository: jest.Mocked<InvitesRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let auditService: jest.Mocked<AuditService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitesService,
        {
          provide: InvitesRepository,
          useValue: {
            createInvite: jest.fn(),
            findByTokenHash: jest.fn(),
            acceptInvite: jest.fn(),
            findById: jest.fn(),
            softDeleteIfUnused: jest.fn(),
            listForWorkspace: jest.fn(),
            findPendingByEmail: jest.fn(),
            findPendingById: jest.fn(),
            findPendingByWorkspaceAndEmail: jest.fn(),
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

    service = moduleRef.get(InvitesService);
    invitesRepository = moduleRef.get(InvitesRepository);
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
  type FoundUser = NonNullable<
    Awaited<ReturnType<UsersRepository['findByEmail']>>
  >;
  type FoundWorkspaceMember = NonNullable<
    Awaited<ReturnType<WorkspacesRepository['findActiveMemberByUserId']>>
  >;
  type CreatedInvitation = Awaited<
    ReturnType<InvitesRepository['createInvite']>
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
      ...overrides,
    };
  }

  function mockUser(overrides: Partial<FoundUser> = {}): FoundUser {
    return {
      id: 'target-user-id',
      email: 'test@example.com',
      username: 'testuser',
      passwordHash: 'hash',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      languages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    };
  }

  function mockWorkspaceMember(
    overrides: Partial<FoundWorkspaceMember> = {},
  ): FoundWorkspaceMember {
    return {
      id: 'wm1',
      workspaceId,
      userId: 'target-user-id',
      role: WorkspaceRole.MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      user: { id: 'target-user-id', username: 'testuser' },
      ...overrides,
    };
  }

  function mockInvitation(
    overrides: Partial<CreatedInvitation> = {},
  ): CreatedInvitation {
    return {
      id: 'invite-id',
      workspaceId,
      invitedById: userId,
      invitedEmail: 'test@example.com',
      role: WorkspaceRole.MEMBER,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: null,
      usedById: null,
      deletedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  type PendingInvitationWithRelations = NonNullable<
    Awaited<ReturnType<InvitesRepository['findPendingById']>>
  >;
  type AcceptedWorkspaceMember = Awaited<
    ReturnType<InvitesRepository['acceptInvite']>
  >;

  function mockPendingInvitationWithRelations(
    overrides: Partial<PendingInvitationWithRelations> = {},
  ): PendingInvitationWithRelations {
    return {
      id: 'invite-id',
      workspaceId,
      invitedById: userId,
      invitedEmail: 'test@example.com',
      role: WorkspaceRole.MEMBER,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: null,
      usedById: null,
      deletedAt: null,
      createdAt: new Date(),
      workspace: { id: workspaceId, name: 'Test Workspace', slug: 'test' },
      invitedBy: { id: 'inviter-id', username: 'inviter', displayName: null },
      ...overrides,
    };
  }

  function mockAcceptedMember(
    overrides: Partial<AcceptedWorkspaceMember> = {},
  ): AcceptedWorkspaceMember {
    return {
      id: 'wm-accepted',
      workspaceId,
      userId,
      role: WorkspaceRole.MEMBER,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    };
  }

  const expectAuditNotCalled = () => {
    expect(auditService.record).not.toHaveBeenCalled();
  };

  it('should allow OWNER to create MEMBER invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    expect(result.token).toBeDefined();
    expect(result.token).toHaveLength(64);
    expect(result.email).toBe('test@example.com');
    expect(result.role).toBe('MEMBER');
    expect(invitesRepository.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        invitedById: userId,
        invitedEmail: 'test@example.com',
        role: 'MEMBER',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        tokenHash: expect.any(String),
      }),
    );
    const callArg = invitesRepository.createInvite.mock
      .calls[0][0] as unknown as {
      workspaceId: string;
      invitedById: string;
      invitedEmail: string;
      role: string;
      tokenHash: string;
      expiresAt: Date;
    };
    expect(callArg.tokenHash).not.toBe(result.token);
  });

  it('should allow ADMIN to create MEMBER invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.ADMIN);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    expect(result.role).toBe('MEMBER');
  });

  it('should reject ADMIN creating ADMIN invite by email', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.ADMIN);

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'ADMIN' },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should reject MEMBER creating invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.MEMBER);

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectAuditNotCalled();
  });

  it('should reject random workspaceId', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(null);

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectAuditNotCalled();
  });

  it('should reject non-member of workspace', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(null);

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectAuditNotCalled();
  });

  it('should reject OWNER role in body', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'OWNER' as 'ADMIN' | 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expectAuditNotCalled();
  });

  it('should store tokenHash, not raw token', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    const callArg = invitesRepository.createInvite.mock
      .calls[0][0] as unknown as {
      workspaceId: string;
      invitedById: string;
      invitedEmail: string;
      role: string;
      tokenHash: string;
      expiresAt: Date;
    };
    expect(callArg.tokenHash).toBeDefined();
    expect(callArg.tokenHash).not.toBe(result.token);
    expect(callArg.tokenHash).toHaveLength(64);
    expect(auditService.record).toHaveBeenCalled();
    const auditCall = auditService.record.mock.calls[0][0] as unknown as {
      metadata: Record<string, unknown>;
    };
    expect(auditCall.metadata).not.toHaveProperty('token');
    expect(auditCall.metadata).not.toHaveProperty('tokenHash');
  });

  it('should set expiresAt to roughly 7 days from now', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const before = Date.now();
    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );
    const after = Date.now();

    const expiresMs = result.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000 - 1000,
    );
    expect(expiresMs).toBeLessThanOrEqual(
      after + 7 * 24 * 60 * 60 * 1000 + 1000,
    );
  });

  it('should reject duplicate active pending invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(
      mockInvitation({
        id: 'existing-invite',
        expiresAt: new Date(Date.now() + 86400000),
      }),
    );

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should allow new invite if previous was declined', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    expect(result.email).toBe('test@example.com');
  });

  it('should allow new invite if previous was used', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    expect(result.email).toBe('test@example.com');
  });

  it('should allow new invite if previous expired', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(mockUser());
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    expect(result.email).toBe('test@example.com');
  });

  it('should reject invite when email belongs to active workspace member', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    usersRepository.findByEmail.mockResolvedValue(
      mockUser({ id: targetUserId }),
    );
    workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
      mockWorkspaceMember({ id: 'wm2', userId: targetUserId }),
    );

    await expect(
      service.create(
        workspaceId,
        { email: 'test@example.com', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should allow invite when email belongs to registered user who is not a member', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    usersRepository.findByEmail.mockResolvedValue(
      mockUser({ id: targetUserId }),
    );
    workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { email: 'test@example.com', role: 'MEMBER' },
      userId,
    );

    expect(result.email).toBe('test@example.com');
  });

  it('should reject invite when email does not belong to any user', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      service.create(
        workspaceId,
        { email: 'unknown@example.com', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should create pending invite by username', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    usersRepository.findByUsername.mockResolvedValue(
      mockUser({ id: targetUserId, email: 'bob@example.com', username: 'bob' }),
    );
    workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { identifier: 'bob', role: 'MEMBER' },
      userId,
    );

    expect(result.email).toBe('bob@example.com');
    expect(usersRepository.findByUsername).toHaveBeenCalledWith('bob');
  });

  it('should create pending invite by @username', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    usersRepository.findByUsername.mockResolvedValue(
      mockUser({ id: targetUserId, email: 'bob@example.com', username: 'bob' }),
    );
    workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null);
    invitesRepository.createInvite.mockImplementation((data) =>
      Promise.resolve({
        ...mockInvitation(),
        workspaceId: data.workspaceId,
        invitedEmail: data.invitedEmail,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    const result = await service.create(
      workspaceId,
      { identifier: '@bob', role: 'MEMBER' },
      userId,
    );

    expect(result.email).toBe('bob@example.com');
    expect(usersRepository.findByUsername).toHaveBeenCalledWith('bob');
  });

  it('should reject unknown username', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByUsername.mockResolvedValue(null);

    await expect(
      service.create(
        workspaceId,
        { identifier: 'unknown', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should block duplicate pending invite by username', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByUsername.mockResolvedValue(
      mockUser({ id: targetUserId, email: 'bob@example.com', username: 'bob' }),
    );
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(
      mockInvitation({
        id: 'existing-invite',
        invitedEmail: 'bob@example.com',
        expiresAt: new Date(Date.now() + 86400000),
      }),
    );

    await expect(
      service.create(
        workspaceId,
        { identifier: 'bob', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should block invite to existing active member by username', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);
    usersRepository.findByUsername.mockResolvedValue(
      mockUser({ id: targetUserId, email: 'bob@example.com', username: 'bob' }),
    );
    invitesRepository.findPendingByWorkspaceAndEmail.mockResolvedValue(null);
    workspacesRepository.findActiveMemberByUserId.mockResolvedValue(
      mockWorkspaceMember({ id: 'wm2', userId: targetUserId }),
    );

    await expect(
      service.create(
        workspaceId,
        { identifier: 'bob', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should reject ADMIN inviting username with role ADMIN', async () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.ADMIN);
    usersRepository.findByUsername.mockResolvedValue(
      mockUser({ id: targetUserId, email: 'bob@example.com', username: 'bob' }),
    );

    await expect(
      service.create(workspaceId, { identifier: 'bob', role: 'ADMIN' }, userId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitesRepository.createInvite).not.toHaveBeenCalled();
    expectAuditNotCalled();
  });

  it('should reject when both email and identifier are missing', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);

    await expect(
      service.create(workspaceId, { role: 'MEMBER' }, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expectAuditNotCalled();
  });

  it('should reject when both email and identifier are provided', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
    workspacesRepository.findMemberRole.mockResolvedValue(WorkspaceRole.OWNER);

    await expect(
      service.create(
        workspaceId,
        { email: 'a@b.com', identifier: 'bob', role: 'MEMBER' },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expectAuditNotCalled();
  });

  describe('accept', () => {
    const rawToken = 'raw-token-123';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    it('should allow accepting a valid invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockResolvedValue(
        mockAcceptedMember({ createdAt: new Date('2026-01-01') }),
      );

      const result = await service.accept(rawToken, userId, 'test@example.com');

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.role).toBe('MEMBER');
      expect(invitesRepository.acceptInvite).toHaveBeenCalledWith(
        'invite-id',
        userId,
        workspaceId,
        'MEMBER',
      );
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_INVITE_ACCEPTED,
        entityType: AuditEntityType.INVITATION,
        entityId: 'invite-id',
        workspaceId,
        metadata: {
          role: 'MEMBER',
        },
      });
    });

    it('should reject invalid token', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject expired invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({
          tokenHash,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(GoneException);
      expectAuditNotCalled();
    });

    it('should reject already used invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash, usedAt: new Date() }),
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should reject email mismatch', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash }),
      );

      await expect(
        service.accept(rawToken, userId, 'different@example.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject already workspace member', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should reject accept for inactive workspace', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(invitesRepository.acceptInvite).not.toHaveBeenCalled();
      expectAuditNotCalled();
    });

    it('should reject OWNER invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash, role: WorkspaceRole.OWNER }),
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectAuditNotCalled();
    });

    it('should hash token before lookup', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockResolvedValue(mockAcceptedMember());

      await service.accept(rawToken, userId, 'test@example.com');

      expect(invitesRepository.findByTokenHash).toHaveBeenCalledWith(
        expect.not.stringMatching(rawToken),
      );
      expect(auditService.record).toHaveBeenCalled();
    });

    it('should map Prisma P2002 to ConflictException on race condition', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({ tokenHash }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      invitesRepository.acceptInvite.mockRejectedValue(prismaError);

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('revoke', () => {
    const inviteId = '44444444-4444-4444-4444-444444444444';

    it('should allow OWNER to revoke unused invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({ id: inviteId, tokenHash: 'hash' }),
      );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(1);

      const result = await service.revoke(workspaceId, inviteId, userId);

      expect(result.id).toBe(inviteId);
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(invitesRepository.softDeleteIfUnused).toHaveBeenCalledWith(
        inviteId,
        expect.any(Date),
      );
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: userId,
        action: AuditAction.WORKSPACE_INVITE_REVOKED,
        entityType: AuditEntityType.INVITATION,
        entityId: inviteId,
        workspaceId,
        metadata: {
          role: 'MEMBER',
        },
      });
    });

    it('should allow ADMIN to revoke unused invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.ADMIN,
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({ id: inviteId, tokenHash: 'hash' }),
      );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(1);

      const result = await service.revoke(workspaceId, inviteId, userId);

      expect(result.id).toBe(inviteId);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.WORKSPACE_INVITE_REVOKED,
        }),
      );
    });

    it('should reject MEMBER revoking invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject non-member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject invite from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({
          id: inviteId,
          tokenHash: 'hash',
          workspaceId: 'other-workspace-id',
        }),
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject already used invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({ id: inviteId, tokenHash: 'hash', usedAt: new Date() }),
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should reject deleted invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({
          id: inviteId,
          tokenHash: 'hash',
          deletedAt: new Date(),
        }),
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should map race-used invite to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.findById
        .mockResolvedValueOnce(
          mockInvitation({ id: inviteId, tokenHash: 'hash' }),
        )
        .mockResolvedValueOnce(
          mockInvitation({
            id: inviteId,
            tokenHash: 'hash',
            usedAt: new Date(),
          }),
        );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(0);

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map race-deleted invite to NotFoundException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.findById
        .mockResolvedValueOnce(
          mockInvitation({ id: inviteId, tokenHash: 'hash' }),
        )
        .mockResolvedValueOnce(
          mockInvitation({
            id: inviteId,
            tokenHash: 'hash',
            deletedAt: new Date(),
          }),
        );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(0);

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('should allow OWNER to list invites', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.listForWorkspace.mockResolvedValue([
        mockInvitation({
          id: 'invite-1',
          invitedEmail: 'a@example.com',
          expiresAt: new Date(Date.now() + 86400000),
        }),
        mockInvitation({
          id: 'invite-2',
          invitedEmail: 'b@example.com',
          role: WorkspaceRole.ADMIN,
          expiresAt: new Date(Date.now() - 86400000),
          usedAt: new Date(),
          usedById: 'user-id',
        }),
        mockInvitation({
          id: 'invite-3',
          invitedEmail: 'c@example.com',
          expiresAt: new Date(Date.now() + 86400000),
          deletedAt: new Date(),
        }),
      ]);

      const result = await service.list(workspaceId, userId);

      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('PENDING');
      expect(result[1].status).toBe('USED');
      expect(result[2].status).toBe('REVOKED');
      expect(result[0]).not.toHaveProperty('tokenHash');
      expect(result[0]).not.toHaveProperty('token');
    });

    it('should allow ADMIN to list invites', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.ADMIN,
      );
      invitesRepository.listForWorkspace.mockResolvedValue([]);

      const result = await service.list(workspaceId, userId);

      expect(result).toEqual([]);
    });

    it('should reject MEMBER listing invites', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );

      await expect(service.list(workspaceId, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should reject non-member listing invites', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(service.list(workspaceId, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(service.list(workspaceId, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should map expired invite status', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.OWNER,
      );
      invitesRepository.listForWorkspace.mockResolvedValue([
        mockInvitation({
          id: 'invite-expired',
          invitedEmail: 'exp@example.com',
          expiresAt: new Date(Date.now() - 86400000),
        }),
      ]);

      const result = await service.list(workspaceId, userId);

      expect(result[0].status).toBe('EXPIRED');
    });
  });

  describe('accept race against revoke', () => {
    const rawToken = 'race-token-123';

    it('should reject accept if invite was revoked between validation and transaction', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockRejectedValue(
        new Error('INVITE_ALREADY_USED_OR_REVOKED'),
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          deletedAt: new Date(),
        }),
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject accept if invite was used between validation and transaction', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        mockInvitation({
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockRejectedValue(
        new Error('INVITE_ALREADY_USED_OR_REVOKED'),
      );
      invitesRepository.findById.mockResolvedValue(
        mockInvitation({
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          usedAt: new Date(),
        }),
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });
  });

  describe('listPending', () => {
    it('should return pending invites for user email', async () => {
      invitesRepository.findPendingByEmail.mockResolvedValue([
        mockPendingInvitationWithRelations({
          id: 'invite-1',
          invitedBy: {
            id: 'inviter-id',
            username: 'inviter',
            displayName: 'The Inviter',
          },
        }),
      ]);

      const result = await service.listPending(userId, 'test@example.com');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('invite-1');
      expect(result[0].workspace.name).toBe('Test Workspace');
      expect(result[0].invitedBy.username).toBe('inviter');
      expect(result[0].role).toBe('MEMBER');
    });

    it('should return empty array when no pending invites', async () => {
      invitesRepository.findPendingByEmail.mockResolvedValue([]);

      const result = await service.listPending(userId, 'test@example.com');

      expect(result).toEqual([]);
    });
  });

  describe('acceptById', () => {
    const inviteId = '55555555-5555-5555-5555-555555555555';

    it('should allow accepting a valid invite by ID', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockResolvedValue(
        mockAcceptedMember({ createdAt: new Date('2026-01-01') }),
      );

      const result = await service.acceptById(
        inviteId,
        userId,
        'test@example.com',
      );

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.role).toBe('MEMBER');
      expect(invitesRepository.acceptInvite).toHaveBeenCalledWith(
        inviteId,
        userId,
        workspaceId,
        'MEMBER',
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.WORKSPACE_INVITE_ACCEPTED,
        }),
      );
    });

    it('should reject invalid invite ID', async () => {
      invitesRepository.findPendingById.mockResolvedValue(null);

      await expect(
        service.acceptById(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject expired invite', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({
          id: inviteId,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(
        service.acceptById(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(GoneException);
      expectAuditNotCalled();
    });

    it('should reject already used invite', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({
          id: inviteId,
          usedAt: new Date(),
        }),
      );

      await expect(
        service.acceptById(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should reject email mismatch', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );

      await expect(
        service.acceptById(inviteId, userId, 'different@example.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should reject already workspace member', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(
        WorkspaceRole.MEMBER,
      );

      await expect(
        service.acceptById(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map Prisma P2002 to ConflictException on race condition', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );
      workspacesRepository.findActiveById.mockResolvedValue(mockWorkspace());
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      invitesRepository.acceptInvite.mockRejectedValue(prismaError);

      await expect(
        service.acceptById(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decline', () => {
    const inviteId = '66666666-6666-6666-6666-666666666666';

    it('should allow declining a valid invite', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(1);

      const result = await service.decline(
        inviteId,
        userId,
        'test@example.com',
      );

      expect(result.id).toBe(inviteId);
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(invitesRepository.softDeleteIfUnused).toHaveBeenCalledWith(
        inviteId,
        expect.any(Date),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.WORKSPACE_INVITE_DECLINED,
        }),
      );
    });

    it('should reject invalid invite ID', async () => {
      invitesRepository.findPendingById.mockResolvedValue(null);

      await expect(
        service.decline(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectAuditNotCalled();
    });

    it('should reject expired invite', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({
          id: inviteId,
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(
        service.decline(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(GoneException);
      expectAuditNotCalled();
    });

    it('should reject email mismatch', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );

      await expect(
        service.decline(inviteId, userId, 'different@example.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectAuditNotCalled();
    });

    it('should map race-used invite to ConflictException', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );
      invitesRepository.findById.mockResolvedValue(
        mockPendingInvitationWithRelations({
          id: inviteId,
          usedAt: new Date(),
        }),
      );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(0);

      await expect(
        service.decline(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
      expectAuditNotCalled();
    });

    it('should map race-deleted invite to NotFoundException', async () => {
      invitesRepository.findPendingById.mockResolvedValue(
        mockPendingInvitationWithRelations({ id: inviteId }),
      );
      invitesRepository.findById.mockResolvedValue(
        mockPendingInvitationWithRelations({
          id: inviteId,
          deletedAt: new Date(),
        }),
      );
      invitesRepository.softDeleteIfUnused.mockResolvedValue(0);

      await expect(
        service.decline(inviteId, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
