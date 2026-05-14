import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { createHash } from 'crypto';
import { InvitesService } from './invites.service';
import { InvitesRepository } from './invites.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';

describe('InvitesService', () => {
  let service: InvitesService;
  let invitesRepository: jest.Mocked<InvitesRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;

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
          },
        },
        {
          provide: WorkspacesRepository,
          useValue: {
            findActiveById: jest.fn(),
            findMemberRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(InvitesService);
    invitesRepository = moduleRef.get(InvitesRepository);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow OWNER to create MEMBER invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
    invitesRepository.createInvite.mockImplementation(async (data) => ({
      id: 'invite-id',
      workspaceId: data.workspaceId,
      invitedEmail: data.invitedEmail,
      role: data.role,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    } as any));

    const result = await service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId);

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
        tokenHash: expect.any(String),
      }),
    );
    const callArg = invitesRepository.createInvite.mock.calls[0][0];
    expect(callArg.tokenHash).not.toBe(result.token);
  });

  it('should allow ADMIN to create MEMBER invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
    invitesRepository.createInvite.mockImplementation(async (data) => ({
      id: 'invite-id',
      workspaceId: data.workspaceId,
      invitedEmail: data.invitedEmail,
      role: data.role,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    } as any));

    const result = await service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId);

    expect(result.role).toBe('MEMBER');
  });

  it('should allow ADMIN to create ADMIN invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
    invitesRepository.createInvite.mockImplementation(async (data) => ({
      id: 'invite-id',
      workspaceId: data.workspaceId,
      invitedEmail: data.invitedEmail,
      role: data.role,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    } as any));

    const result = await service.create(workspaceId, { email: 'test@example.com', role: 'ADMIN' }, userId);

    expect(result.role).toBe('ADMIN');
  });

  it('should reject MEMBER creating invite', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

    await expect(
      service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject random workspaceId', async () => {
    workspacesRepository.findActiveById.mockResolvedValue(null);

    await expect(
      service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject non-member of workspace', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue(null);

    await expect(
      service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject OWNER role in body', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('OWNER');

    await expect(
      service.create(workspaceId, { email: 'test@example.com', role: 'OWNER' as any }, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should store tokenHash, not raw token', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
    invitesRepository.createInvite.mockImplementation(async (data) => ({
      id: 'invite-id',
      workspaceId: data.workspaceId,
      invitedEmail: data.invitedEmail,
      role: data.role,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    } as any));

    const result = await service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId);

    const callArg = invitesRepository.createInvite.mock.calls[0][0];
    expect(callArg.tokenHash).toBeDefined();
    expect(callArg.tokenHash).not.toBe(result.token);
    expect(callArg.tokenHash).toHaveLength(64);
  });

  it('should set expiresAt to roughly 7 days from now', async () => {
    workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
    workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
    invitesRepository.createInvite.mockImplementation(async (data) => ({
      id: 'invite-id',
      workspaceId: data.workspaceId,
      invitedEmail: data.invitedEmail,
      role: data.role,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    } as any));

    const before = Date.now();
    const result = await service.create(workspaceId, { email: 'test@example.com', role: 'MEMBER' }, userId);
    const after = Date.now();

    const expiresMs = result.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000 + 1000);
  });

  describe('accept', () => {
    const rawToken = 'raw-token-123';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    function makeInvite(overrides: any = {}) {
      return {
        id: 'invite-id',
        workspaceId,
        invitedEmail: 'test@example.com',
        role: 'MEMBER',
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: null,
        usedById: null,
        deletedAt: null,
        ...overrides,
      };
    }

    it('should allow accepting a valid invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(makeInvite() as any);
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockResolvedValue({
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      } as any);

      const result = await service.accept(rawToken, userId, 'test@example.com');

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.role).toBe('MEMBER');
      expect(invitesRepository.acceptInvite).toHaveBeenCalledWith(
        'invite-id',
        userId,
        workspaceId,
        'MEMBER',
      );
    });

    it('should reject invalid token', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject expired invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({ expiresAt: new Date(Date.now() - 1000) }) as any,
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('should reject already used invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({ usedAt: new Date() }) as any,
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject email mismatch', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(makeInvite() as any);

      await expect(
        service.accept(rawToken, userId, 'different@example.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject already workspace member', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(makeInvite() as any);
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject accept for inactive workspace', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(makeInvite() as any);
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(invitesRepository.acceptInvite).not.toHaveBeenCalled();
    });

    it('should reject OWNER invite', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(
        makeInvite({ role: 'OWNER' }) as any,
      );

      await expect(
        service.accept(rawToken, userId, 'test@example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should hash token before lookup', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(makeInvite() as any);
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);
      invitesRepository.acceptInvite.mockResolvedValue({
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date(),
      } as any);

      await service.accept(rawToken, userId, 'test@example.com');

      expect(invitesRepository.findByTokenHash).toHaveBeenCalledWith(
        expect.not.stringMatching(rawToken),
      );
    });

    it('should map Prisma P2002 to ConflictException on race condition', async () => {
      invitesRepository.findByTokenHash.mockResolvedValue(makeInvite() as any);
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
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

    function makeInvite(overrides: any = {}) {
      return {
        id: inviteId,
        workspaceId,
        invitedEmail: 'test@example.com',
        role: 'MEMBER',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: null,
        usedById: null,
        deletedAt: null,
        ...overrides,
      };
    }

    it('should allow OWNER to revoke unused invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      invitesRepository.findById.mockResolvedValue(makeInvite() as any);
      invitesRepository.softDeleteIfUnused.mockResolvedValue(1);

      const result = await service.revoke(workspaceId, inviteId, userId);

      expect(result.id).toBe(inviteId);
      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(invitesRepository.softDeleteIfUnused).toHaveBeenCalledWith(inviteId);
    });

    it('should allow ADMIN to revoke unused invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      invitesRepository.findById.mockResolvedValue(makeInvite() as any);
      invitesRepository.softDeleteIfUnused.mockResolvedValue(1);

      const result = await service.revoke(workspaceId, inviteId, userId);

      expect(result.id).toBe(inviteId);
    });

    it('should reject MEMBER revoking invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject non-member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject invite from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      invitesRepository.findById.mockResolvedValue(
        makeInvite({ workspaceId: 'other-workspace-id' }) as any,
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject already used invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      invitesRepository.findById.mockResolvedValue(
        makeInvite({ usedAt: new Date() }) as any,
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject deleted invite', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      invitesRepository.findById.mockResolvedValue(
        makeInvite({ deletedAt: new Date() }) as any,
      );

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should map race-used invite to ConflictException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      invitesRepository.findById
        .mockResolvedValueOnce(makeInvite() as any)
        .mockResolvedValueOnce(makeInvite({ usedAt: new Date() }) as any);
      invitesRepository.softDeleteIfUnused.mockResolvedValue(0);

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should map race-deleted invite to NotFoundException', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      invitesRepository.findById
        .mockResolvedValueOnce(makeInvite() as any)
        .mockResolvedValueOnce(makeInvite({ deletedAt: new Date() }) as any);
      invitesRepository.softDeleteIfUnused.mockResolvedValue(0);

      await expect(
        service.revoke(workspaceId, inviteId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
