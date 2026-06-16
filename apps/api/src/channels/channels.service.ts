import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType, Prisma } from '@lets-chat/database';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { ChannelsRepository } from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';
import { slugify } from '../common/transliterate';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly channels: ChannelsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
  ) {}

  async create(workspaceId: string, dto: CreateChannelDto, userId: string) {
    // Any active WorkspaceMember may create a channel.
    // The creator receives ChannelMember OWNER role.
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }

    const slug = slugify(dto.name);
    if (slug.length < 2) {
      throw new BadRequestException('Invalid channel name');
    }

    const existing = await this.channels.findBySlug(workspaceId, slug);
    if (existing) {
      throw new ConflictException('Channel slug already in use');
    }

    try {
      return await this.channels.createChannel(
        {
          workspaceId,
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim(),
          type: dto.type ?? ChannelType.PUBLIC,
          createdById: userId,
        },
        userId,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Channel slug already in use');
      }
      throw error;
    }
  }

  async list(workspaceId: string, userId: string) {
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    return this.channels.listForWorkspaceWithUnread(workspaceId, userId);
  }

  async listArchived(workspaceId: string, userId: string) {
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    return this.channels.listArchivedForWorkspace(workspaceId, userId);
  }

  async findById(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  async markChannelRead(
    workspaceId: string,
    channelId: string,
    userId: string,
  ) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      throw new NotFoundException('Channel not found');
    }

    const lastReadAt = new Date();
    await this.channels.upsertChannelReadState(
      workspaceId,
      channelId,
      userId,
      lastReadAt,
    );
    return { success: true, lastReadAt };
  }

  async update(
    workspaceId: string,
    channelId: string,
    dto: UpdateChannelDto,
    userId: string,
  ) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      if (channel.type === 'PUBLIC') {
        throw new ForbiddenException('Insufficient permissions');
      }
      throw new NotFoundException('Channel not found');
    }
    if (chRole !== 'OWNER' && chRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const updateData: { name?: string; description?: string } = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    return this.channels.updateChannel(channelId, updateData);
  }

  async listChannelMembers(
    workspaceId: string,
    channelId: string,
    userId: string,
  ) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      throw new NotFoundException('Channel not found');
    }

    const members = await this.channels.listActiveChannelMembers(channelId);
    return members.map((member) => ({
      id: member.id,
      channelId: member.channelId,
      role: member.role,
      joinedAt: member.createdAt,
      user: {
        id: member.user.id,
        username: member.user.username,
        displayName: member.user.displayName,
        avatarUrl: member.user.avatarUrl,
      },
    }));
  }

  async addChannelMember(
    workspaceId: string,
    channelId: string,
    userId: string,
    dto: { identifier: string; role?: string },
  ) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const requesterChRole = await this.channels.findChannelMemberRole(
      channelId,
      userId,
    );
    if (!requesterChRole) {
      if (channel.type === 'PUBLIC') {
        throw new ForbiddenException('Insufficient permissions');
      }
      throw new NotFoundException('Channel not found');
    }
    if (requesterChRole !== 'OWNER' && requesterChRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const role = (dto.role as 'MEMBER' | 'ADMIN' | 'OWNER') ?? 'MEMBER';
    if (role === 'OWNER') {
      throw new BadRequestException('Cannot assign OWNER role');
    }
    if (role !== 'MEMBER' && role !== 'ADMIN') {
      throw new BadRequestException('Invalid role');
    }
    if (requesterChRole === 'ADMIN' && role === 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const identifier = dto.identifier.trim();
    let targetUser = await this.users.findByUsername(identifier);
    if (!targetUser) {
      targetUser = await this.users.findByEmail(identifier);
    }
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const targetWsMember = await this.workspaces.findActiveMemberByUserId(
      workspaceId,
      targetUser.id,
    );
    if (!targetWsMember) {
      throw new NotFoundException('User is not a workspace member');
    }

    const existingMember = await this.channels.findActiveChannelMemberByUserId(
      channelId,
      targetUser.id,
    );
    if (existingMember) {
      throw new ConflictException('User is already a channel member');
    }

    try {
      const member = await this.channels.createChannelMember({
        channelId,
        userId: targetUser.id,
        role,
      });

      return {
        id: member.id,
        channelId: member.channelId,
        role: member.role,
        joinedAt: member.createdAt,
        user: {
          id: member.user.id,
          username: member.user.username,
          displayName: member.user.displayName,
          avatarUrl: member.user.avatarUrl,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User is already a channel member');
      }
      throw error;
    }
  }

  async removeChannelMember(
    workspaceId: string,
    channelId: string,
    memberId: string,
    userId: string,
  ) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const requesterChRole = await this.channels.findChannelMemberRole(
      channelId,
      userId,
    );
    if (!requesterChRole) {
      if (channel.type === 'PUBLIC') {
        throw new ForbiddenException('Insufficient permissions');
      }
      throw new NotFoundException('Channel not found');
    }
    if (requesterChRole !== 'OWNER' && requesterChRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const targetMember = await this.channels.findActiveChannelMemberById(
      channelId,
      memberId,
    );
    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    if (targetMember.role === 'OWNER') {
      throw new ForbiddenException('Cannot remove channel owner');
    }

    if (requesterChRole === 'ADMIN' && targetMember.role !== 'MEMBER') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const deletedCount = await this.channels.softDeleteChannelMember(
      channelId,
      targetMember.id,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Member not found');
    }
    return { success: true };
  }

  async leaveChannel(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const member = await this.channels.findActiveChannelMemberByUserId(
      channelId,
      userId,
    );
    if (!member) {
      throw new NotFoundException('Channel not found');
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException('Owner cannot leave channel');
    }

    const deletedCount = await this.channels.softDeleteChannelMember(
      channelId,
      member.id,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Channel not found');
    }

    return { success: true };
  }

  async archive(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      if (channel.type === 'PUBLIC') {
        throw new ForbiddenException('Insufficient permissions');
      }
      throw new NotFoundException('Channel not found');
    }
    if (chRole !== 'OWNER') {
      throw new ForbiddenException('Only owner can archive channel');
    }

    await this.channels.archiveChannel(channelId);
    return { success: true };
  }

  async delete(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }
    if (wsRole !== 'OWNER') {
      throw new ForbiddenException('Only workspace owner can delete channels');
    }

    const channel = await this.channels.findByIdIncludingArchived(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }
    if (channel.permanentlyDeletedAt) {
      throw new NotFoundException('Channel not found');
    }

    await this.channels.permanentlyDeleteChannel(channelId);
    return { success: true };
  }

  async restore(workspaceId: string, channelId: string, userId: string) {
    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findByIdIncludingArchived(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      throw new NotFoundException('Channel not found');
    }
    if (chRole !== 'OWNER') {
      throw new ForbiddenException('Only owner can restore channel');
    }

    if (!channel.deletedAt) {
      throw new ConflictException('Channel is not archived');
    }

    await this.channels.restoreChannel(channelId);
    return { success: true };
  }
}
