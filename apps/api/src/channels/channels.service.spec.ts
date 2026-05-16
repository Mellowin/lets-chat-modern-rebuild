import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { ChannelsService } from './channels.service';
import { ChannelsRepository } from './channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let channelsRepository: jest.Mocked<ChannelsRepository>;
  let workspacesRepository: jest.Mocked<WorkspacesRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;

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
            findActiveChannelMemberByUserId: jest.fn(),
            findActiveChannelMemberById: jest.fn(),
            createChannelMember: jest.fn(),
            listActiveChannelMembers: jest.fn(),
            updateChannel: jest.fn(),
            archiveChannel: jest.fn(),
            softDeleteChannelMember: jest.fn(),
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
          provide: WorkspacesRepository,
          useValue: {
            findMemberRole: jest.fn(),
            findActiveMemberByUserId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ChannelsService);
    channelsRepository = moduleRef.get(ChannelsRepository);
    usersRepository = moduleRef.get(UsersRepository);
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

  describe('addChannelMember', () => {
    const targetUserId = '44444444-4444-4444-4444-444444444444';
    const memberId = '55555555-5555-5555-5555-555555555555';

    it('allows OWNER to add workspace member to channel as MEMBER', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({ id: targetUserId, username: 'alice' } as any);
      usersRepository.findByEmail.mockResolvedValue(null as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'ws-member-1',
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(null as any);
      channelsRepository.createChannelMember.mockResolvedValue({
        id: memberId,
        channelId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'alice' },
      } as any);

      const result = await service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' });

      expect(result.role).toBe('MEMBER');
      expect(result.user.username).toBe('alice');
    });

    it('allows ADMIN to add workspace member to channel', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      usersRepository.findByUsername.mockResolvedValue({ id: targetUserId, username: 'bob' } as any);
      usersRepository.findByEmail.mockResolvedValue(null as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'ws-member-1',
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(null as any);
      channelsRepository.createChannelMember.mockResolvedValue({
        id: memberId,
        channelId,
        role: 'MEMBER',
        createdAt: new Date('2026-01-01'),
        user: { id: targetUserId, username: 'bob' },
      } as any);

      const result = await service.addChannelMember(workspaceId, channelId, userId, { identifier: 'bob' });

      expect(result.role).toBe('MEMBER');
      expect(result.user.username).toBe('bob');
    });

    it('rejects MEMBER requester', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-workspace requester', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects channel from another workspace', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId: '99999999-9999-9999-9999-999999999999',
        type: 'PUBLIC',
      } as any);

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when target user not found', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue(null as any);
      usersRepository.findByEmail.mockResolvedValue(null as any);

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'unknown' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when target user is not workspace member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({ id: targetUserId, username: 'alice' } as any);
      usersRepository.findByEmail.mockResolvedValue(null as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue(null as any);

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 when user is already active channel member', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({ id: targetUserId, username: 'alice' } as any);
      usersRepository.findByEmail.mockResolvedValue(null as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'ws-member-1',
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue({
        id: 'existing-channel-member',
        channelId,
        role: 'MEMBER',
        userId: targetUserId,
      } as any);

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects OWNER role assignment', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice', role: 'OWNER' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid role', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice', role: 'GOD' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps Prisma P2002 to ConflictException', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      usersRepository.findByUsername.mockResolvedValue({ id: targetUserId, username: 'alice' } as any);
      usersRepository.findByEmail.mockResolvedValue(null as any);
      workspacesRepository.findActiveMemberByUserId.mockResolvedValue({
        id: 'ws-member-1',
        workspaceId,
        role: 'MEMBER',
        userId: targetUserId,
      } as any);
      channelsRepository.findActiveChannelMemberByUserId.mockResolvedValue(null as any);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      channelsRepository.createChannelMember.mockRejectedValue(prismaError);

      await expect(
        service.addChannelMember(workspaceId, channelId, userId, { identifier: 'alice' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('removeChannelMember', () => {
    const targetMemberId = '66666666-6666-6666-6666-666666666666';
    const targetUserId = '44444444-4444-4444-4444-444444444444';

    it('OWNER can remove MEMBER', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue({
        id: targetMemberId,
        channelId,
        role: 'MEMBER',
        userId: targetUserId,
        user: { id: targetUserId, username: 'bob' },
      } as any);
      channelsRepository.softDeleteChannelMember.mockResolvedValue({
        id: targetMemberId,
        deletedAt: new Date(),
      } as any);

      const result = await service.removeChannelMember(workspaceId, channelId, targetMemberId, userId);

      expect(result.success).toBe(true);
      expect(channelsRepository.softDeleteChannelMember).toHaveBeenCalledWith(targetMemberId);
    });

    it('OWNER can remove ADMIN', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue({
        id: targetMemberId,
        channelId,
        role: 'ADMIN',
        userId: targetUserId,
        user: { id: targetUserId, username: 'bob' },
      } as any);
      channelsRepository.softDeleteChannelMember.mockResolvedValue({
        id: targetMemberId,
        deletedAt: new Date(),
      } as any);

      const result = await service.removeChannelMember(workspaceId, channelId, targetMemberId, userId);

      expect(result.success).toBe(true);
    });

    it('ADMIN can remove MEMBER', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue({
        id: targetMemberId,
        channelId,
        role: 'MEMBER',
        userId: targetUserId,
        user: { id: targetUserId, username: 'bob' },
      } as any);
      channelsRepository.softDeleteChannelMember.mockResolvedValue({
        id: targetMemberId,
        deletedAt: new Date(),
      } as any);

      const result = await service.removeChannelMember(workspaceId, channelId, targetMemberId, userId);

      expect(result.success).toBe(true);
    });

    it('ADMIN cannot remove ADMIN', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue({
        id: targetMemberId,
        channelId,
        role: 'ADMIN',
        userId: targetUserId,
        user: { id: targetUserId, username: 'bob' },
      } as any);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(channelsRepository.softDeleteChannelMember).not.toHaveBeenCalled();
    });

    it('ADMIN cannot remove OWNER', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('ADMIN');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue({
        id: targetMemberId,
        channelId,
        role: 'OWNER',
        userId: targetUserId,
        user: { id: targetUserId, username: 'bob' },
      } as any);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(channelsRepository.softDeleteChannelMember).not.toHaveBeenCalled();
    });

    it('MEMBER requester cannot remove anyone', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('MEMBER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('MEMBER');

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(channelsRepository.findActiveChannelMemberById).not.toHaveBeenCalled();
      expect(channelsRepository.softDeleteChannelMember).not.toHaveBeenCalled();
    });

    it('Cannot remove OWNER even by OWNER', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue({
        id: targetMemberId,
        channelId,
        role: 'OWNER',
        userId: targetUserId,
        user: { id: targetUserId, username: 'bob' },
      } as any);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(channelsRepository.softDeleteChannelMember).not.toHaveBeenCalled();
    });

    it('Non-workspace requester -> 404', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue(null);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(channelsRepository.findActiveChannelMemberById).not.toHaveBeenCalled();
    });

    it('Wrong workspace/channel mismatch -> 404', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId: '99999999-9999-9999-9999-999999999999',
        type: 'PUBLIC',
      } as any);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(channelsRepository.findActiveChannelMemberById).not.toHaveBeenCalled();
    });

    it('Missing/inactive target member -> 404', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue(null);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(channelsRepository.softDeleteChannelMember).not.toHaveBeenCalled();
    });

    it('Second remove attempt -> 404', async () => {
      workspacesRepository.findMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveById.mockResolvedValue({
        id: channelId,
        workspaceId,
        type: 'PUBLIC',
      } as any);
      channelsRepository.findChannelMemberRole.mockResolvedValue('OWNER');
      channelsRepository.findActiveChannelMemberById.mockResolvedValue(null);

      await expect(
        service.removeChannelMember(workspaceId, channelId, targetMemberId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
