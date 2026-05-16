import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsRepository } from './channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let channelsRepository: jest.Mocked<ChannelsRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const channelId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: ChannelsRepository,
          useValue: {
            findActiveById: jest.fn(),
            findChannelMemberRole: jest.fn(),
            listActiveChannelMembers: jest.fn(),
            updateChannel: jest.fn(),
            archiveChannel: jest.fn(),
          },
        },
        {
          provide: WorkspacesRepository,
          useValue: {
            findMemberRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ChannelsService);
    channelsRepository = moduleRef.get(ChannelsRepository);
    workspacesRepository = moduleRef.get(WorkspacesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.findById(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when channel belongs to another workspace', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId: '99999999-9999-9999-9999-999999999999',
        type: 'PUBLIC',
      } as any);

      await expect(
        service.findById(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for PRIVATE channel when user is not a channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.findById(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns PUBLIC channel for workspace member', async () => {
      const channel = {
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(channel);

      const result = await service.findById(workspaceId, channelId, userId);
      expect(result).toBe(channel);
    });

    it('returns PRIVATE channel for channel member', async () => {
      const channel = {
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue(channel);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      const result = await service.findById(workspaceId, channelId, userId);
      expect(result).toBe(channel);
    });
  });

  describe('update', () => {
    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.update(workspaceId, channelId, { name: 'New Name' }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException for PUBLIC channel when user is workspace member but not channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.update(workspaceId, channelId, { name: 'New Name' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for channel member with MEMBER role', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.update(workspaceId, channelId, { name: 'New Name' }, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates channel for ADMIN role', async () => {
      const updated = { id: channelId, name: 'New Name' } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.updateChannel.mockResolvedValue(updated);

      const result = await service.update(
        workspaceId,
        channelId,
        { name: 'New Name' },
        userId,
      );
      expect(result).toBe(updated);
    });

    it('updates channel for OWNER role', async () => {
      const updated = { id: channelId, name: 'New Name' } as any;
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.updateChannel.mockResolvedValue(updated);

      const result = await service.update(
        workspaceId,
        channelId,
        { name: 'New Name' },
        userId,
      );
      expect(result).toBe(updated);
    });
  });

  describe('archive', () => {
    it('throws ForbiddenException for MEMBER role', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.archive(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for ADMIN role', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');

      await expect(
        service.archive(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('archives channel for OWNER role', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.archiveChannel.mockResolvedValue({
        id: channelId,
        deletedAt: new Date(),
      } as any);

      const result = await service.archive(workspaceId, channelId, userId);
      expect(result.success).toBe(true);
    });
  });

  describe('listChannelMembers', () => {
    it('allows OWNER to list channel members', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.listActiveChannelMembers.mockResolvedValue([
        {
          id: 'member-1',
          channelId,
          role: 'OWNER',
          createdAt: new Date('2026-01-01'),
          user: { id: userId, username: 'owner' },
        },
      ] as any);

      const result = await service.listChannelMembers(workspaceId, channelId, userId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('OWNER');
      expect(result[0].user.username).toBe('owner');
    });

    it('allows workspace member to list PUBLIC channel members', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.listActiveChannelMembers.mockResolvedValue([
        {
          id: 'member-1',
          channelId,
          role: 'OWNER',
          createdAt: new Date('2026-01-01'),
          user: { id: 'user-1', username: 'alice' },
        },
        {
          id: 'member-2',
          channelId,
          role: 'MEMBER',
          createdAt: new Date('2026-01-01'),
          user: { id: 'user-2', username: 'bob' },
        },
      ] as any);

      const result = await service.listChannelMembers(workspaceId, channelId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].user.username).toBe('alice');
      expect(result[1].user.username).toBe('bob');
    });

    it('throws NotFoundException for non-workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.listChannelMembers(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when channel belongs to another workspace', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId: '99999999-9999-9999-9999-999999999999',
        type: 'PUBLIC',
      } as any);

      await expect(
        service.listChannelMembers(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for PRIVATE channel when user is not a channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue(null);

      await expect(
        service.listChannelMembers(workspaceId, channelId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows channel member to list PRIVATE channel members', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PRIVATE',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.listActiveChannelMembers.mockResolvedValue([
        {
          id: 'member-1',
          channelId,
          role: 'OWNER',
          createdAt: new Date('2026-01-01'),
          user: { id: 'user-1', username: 'alice' },
        },
        {
          id: 'member-2',
          channelId,
          role: 'MEMBER',
          createdAt: new Date('2026-01-01'),
          user: { id: userId, username: 'bob' },
        },
      ] as any);

      const result = await service.listChannelMembers(workspaceId, channelId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].user.username).toBe('alice');
      expect(result[1].user.username).toBe('bob');
    });
  });
});
