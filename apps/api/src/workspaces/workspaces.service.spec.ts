import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
});
