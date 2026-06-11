import { Injectable } from '@nestjs/common';
import { ChannelRole, Prisma, PrismaService } from '@lets-chat/database';

interface CreateChannelInput {
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  type: 'PUBLIC' | 'PRIVATE';
  createdById: string;
}

export interface ChannelWithUnread {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'PUBLIC' | 'PRIVATE';
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  unreadCount: number;
  hasUnread: boolean;
  lastReadAt: Date | null;
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

  async listForWorkspaceWithUnread(
    workspaceId: string,
    userId: string,
  ): Promise<ChannelWithUnread[]> {
    const channels = await this.prisma.channel.findMany({
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

    if (channels.length === 0) {
      return [];
    }

    const channelIds = channels.map((c) => c.id);

    const readStates = await this.prisma.channelReadState.findMany({
      where: {
        workspaceId,
        userId,
        channelId: { in: channelIds },
      },
      select: { channelId: true, lastReadAt: true },
    });

    const readStateMap = new Map(
      readStates.map((rs) => [rs.channelId, rs.lastReadAt]),
    );

    const unreadCounts = await this.prisma.$queryRaw<
      { channelId: string; unreadCount: number }[]
    >`
      SELECT m."channelId", COUNT(*)::int as "unreadCount"
      FROM "Message" m
      LEFT JOIN "ChannelReadState" crs ON crs."channelId" = m."channelId" AND crs."userId" = ${userId}
      WHERE m."channelId" IN (${Prisma.join(channelIds)})
        AND m."deletedAt" IS NULL
        AND m."authorId" != ${userId}
        AND m."createdAt" > COALESCE(crs."lastReadAt", '1970-01-01'::timestamp)
      GROUP BY m."channelId"
    `;

    const unreadCountMap = new Map(
      unreadCounts.map((u) => [u.channelId, u.unreadCount]),
    );

    return channels.map((ch) => ({
      ...ch,
      unreadCount: unreadCountMap.get(ch.id) ?? 0,
      hasUnread: (unreadCountMap.get(ch.id) ?? 0) > 0,
      lastReadAt: readStateMap.get(ch.id) ?? null,
    }));
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
            avatarUrl: true,
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
            displayName: true,
            avatarUrl: true,
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
            displayName: true,
            avatarUrl: true,
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
            avatarUrl: true,
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

  async softDeleteChannelMembersByWorkspaceAndUserId(
    workspaceId: string,
    userId: string,
  ) {
    const result = await this.prisma.channelMember.updateMany({
      where: {
        userId,
        deletedAt: null,
        channel: {
          workspaceId,
          deletedAt: null,
        },
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  async upsertChannelReadState(
    workspaceId: string,
    channelId: string,
    userId: string,
    lastReadAt: Date,
  ) {
    return this.prisma.channelReadState.upsert({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
      create: {
        workspaceId,
        channelId,
        userId,
        lastReadAt,
      },
      update: {
        lastReadAt,
      },
    });
  }

  async findChannelReadState(channelId: string, userId: string) {
    return this.prisma.channelReadState.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });
  }
}
