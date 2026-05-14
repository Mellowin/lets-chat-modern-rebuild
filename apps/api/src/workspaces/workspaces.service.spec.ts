import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesRepository } from './workspaces.repository';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;

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
            updateMemberRole: jest.fn(),
            softDeleteMember: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WorkspacesService);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listMembers', () => {
    it('should allow OWNER to list members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.listActiveMembers.mockResolvedValue([
        {
          id: 'member-1',
          workspaceId,
          role: 'OWNER',
          createdAt: new Date('2026-01-01'),
          user: { id: userId, username: 'owner' },
        },
      ] as any);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('OWNER');
      expect(result[0].user.username).toBe('owner');
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('should allow ADMIN to list members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      workspacesRepository.listActiveMembers.mockResolvedValue([]);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toEqual([]);
    });

    it('should allow MEMBER to list members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      workspacesRepository.listActiveMembers.mockResolvedValue([]);

      const result = await service.listMembers(workspaceId, userId);

      expect(result).toEqual([]);
    });

    it('should reject non-member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(service.listMembers(workspaceId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(service.listMembers(workspaceId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should only return active members', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
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
      ] as any);

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
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);
      workspacesRepository.updateMemberRole.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);

      const result = await service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId);

      expect(result.role).toBe('ADMIN');
      expect(result.user.username).toBe('alice');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should allow OWNER to demote ADMIN to MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as any);
      workspacesRepository.updateMemberRole.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as any);

      const result = await service.updateMemberRole(workspaceId, memberId, { role: 'MEMBER' }, userId);

      expect(result.role).toBe('MEMBER');
    });

    it('should reject ADMIN requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject target member from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject deleted target member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject changing role of current OWNER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'owner' },
      } as any);

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should reject OWNER role in body', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);

      await expect(
        service.updateMemberRole(workspaceId, memberId, { role: 'OWNER' }, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should return updated member without passwordHash', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);
      workspacesRepository.updateMemberRole.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);

      const result = await service.updateMemberRole(workspaceId, memberId, { role: 'ADMIN' }, userId);

      expect(result).toEqual({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        joinedAt: expect.any(Date),
        user: {
          id: targetUserId,
          username: 'alice',
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('removeMember', () => {
    const memberId = '33333333-3333-3333-3333-333333333333';
    const targetUserId = '44444444-4444-4444-4444-444444444444';

    it('should allow OWNER to remove MEMBER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result.id).toBe(memberId);
      expect(result.workspaceId).toBe(workspaceId);
      expect(result).toHaveProperty('deletedAt');
    });

    it('should allow OWNER to remove ADMIN', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'ADMIN',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as any);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result.id).toBe(memberId);
      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('should reject ADMIN requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject MEMBER requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject non-member requester', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject inactive workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject target member from another workspace', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject already deleted target member', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue(null);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject removing workspace OWNER', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'owner' },
      } as any);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should reject self-removal', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'OWNER',
        userId,
        createdAt: new Date('2026-01-01'),
        user: { id: userId, username: 'owner' },
      } as any);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should reject when soft delete affects 0 rows', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);
      workspacesRepository.softDeleteMember.mockResolvedValue(0);

      await expect(
        service.removeMember(workspaceId, memberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should return correct response shape', async () => {
      workspacesRepository.findActiveById.mockResolvedValue({ id: workspaceId } as any);
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      workspacesRepository.findActiveMemberById.mockResolvedValue({
        id: memberId,
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);
      workspacesRepository.softDeleteMember.mockResolvedValue(1);

      const result = await service.removeMember(workspaceId, memberId, userId);

      expect(result).toEqual({
        id: memberId,
        workspaceId,
        deletedAt: expect.any(Date),
      });
    });
  });
});
