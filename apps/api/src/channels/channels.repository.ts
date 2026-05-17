import { Injectable } from '@nestjs/common';
import { ChannelRole, PrismaService } from '@lets-chat/database';

interface CreateChannelInput {
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  type: 'PUBLIC' | 'PRIVATE';
  createdById: string;
}

@Injectable()
export class ChannelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createChannel(data: CreateChannelInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          type: data.type,
          createdById: data.createdById,
        },
      });
      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId,
          role: 'OWNER',
        },
      });
      return channel;
    });
  }

  async findBySlug(workspaceId: string, slug: string) {
    return this.prisma.channel.findFirst({
      where: {
        workspaceId,
        slug,
        deletedAt: null,
      },
    });
  }

  async listForWorkspace(workspaceId: string, userId: string) {
    return this.prisma.channel.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        members: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listArchivedForWorkspace(workspaceId: string, userId: string) {
    return this.prisma.channel.findMany({
      where: {
        workspaceId,
        deletedAt: { not: null },
        members: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findActiveById(channelId: string) {
    return this.prisma.channel.findFirst({
      where: { id: channelId, deletedAt: null },
    });
  }

  async findChannelMemberRole(
    channelId: string,
    userId: string,
  ): Promise<ChannelRole | null> {
    const member = await this.prisma.channelMember.findFirst({
      where: {
        channelId,
        userId,
        deletedAt: null,
      },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async updateChannel(
    channelId: string,
    data: { name?: string; description?: string },
  ) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data,
    });
  }

  async findActiveChannelMemberByUserId(channelId: string, userId: string) {
    return this.prisma.channelMember.findFirst({
      where: {
        channelId,
        userId,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async createChannelMember(data: {
    channelId: string;
    userId: string;
    role: ChannelRole;
  }) {
    return this.prisma.channelMember.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async listActiveChannelMembers(channelId: string) {
    return this.prisma.channelMember.findMany({
      where: {
        channelId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async findByIdIncludingArchived(channelId: string) {
    return this.prisma.channel.findFirst({
      where: { id: channelId },
    });
  }

  async archiveChannel(channelId: string) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { deletedAt: new Date() },
    });
  }

  async restoreChannel(channelId: string) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { deletedAt: null },
    });
  }

  async findActiveChannelMemberById(channelId: string, memberId: string) {
    return this.prisma.channelMember.findFirst({
      where: {
        id: memberId,
        channelId,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async softDeleteChannelMember(channelId: string, memberId: string) {
    const result = await this.prisma.channelMember.updateMany({
      where: {
        id: memberId,
        channelId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }
}
