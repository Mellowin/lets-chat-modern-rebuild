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
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
      },
    });
  }

  async listForWorkspace(workspaceId: string, userId: string) {
    return this.prisma.channel.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
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
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
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
      LEFT JOIN "ChannelReadState" crs ON crs."channelId" = m."channelId" AND crs."userId" = ${userId}::uuid
      WHERE m."channelId" = ANY(${channelIds}::uuid[])
        AND m."deletedAt" IS NULL
        AND m."authorId" != ${userId}::uuid
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
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
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
      where: {
        id: channelId,
        deletedAt: null,
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
      },
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

  async findMentionableUserIds(channelId: string): Promise<string[]> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { workspaceId: true, type: true },
    });
    if (!channel) return [];

    if (channel.type === 'PRIVATE') {
      const members = await this.prisma.channelMember.findMany({
        where: { channelId, deletedAt: null },
        select: { userId: true },
      });
      return members.map((m) => m.userId);
    }

    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: channel.workspaceId,
        deletedAt: null,
      },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
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
            displayName: true,
            avatarUrl: true,
            status: true,
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
            status: true,
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
            status: true,
          },
        },
      },
    });
  }

  async findByIdIncludingArchived(channelId: string) {
    return this.prisma.channel.findFirst({
      where: {
        id: channelId,
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
      },
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

  async permanentlyDeleteChannel(channelId: string) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data: {
        deletedAt: new Date(),
        permanentlyDeletedAt: new Date(),
      },
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
            displayName: true,
            avatarUrl: true,
            status: true,
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

  async transferOwnership(data: {
    channelId: string;
    currentOwnerMemberId: string;
    currentOwnerUserId: string;
    targetMemberId: string;
    targetUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the current owner's active membership and re-verify it is still the
      // owner inside this transaction.
      const lockedCurrentOwner = await tx.$queryRawUnsafe<
        Array<{ id: string; userId: string; role: string }>
      >(
        `SELECT id, "userId", role FROM "ChannelMember" WHERE id = $1::uuid AND "channelId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE`,
        data.currentOwnerMemberId,
        data.channelId,
      );
      if (
        !lockedCurrentOwner ||
        lockedCurrentOwner.length === 0 ||
        lockedCurrentOwner[0].userId !== data.currentOwnerUserId ||
        lockedCurrentOwner[0].role !== 'OWNER'
      ) {
        throw new Error('OWNERSHIP_STATE_CHANGED');
      }

      // Lock the target membership and re-verify it is active and not already an
      // owner. A target that is the current owner is rejected as well.
      const lockedTargetMember = await tx.$queryRawUnsafe<
        Array<{ id: string; userId: string; role: string }>
      >(
        `SELECT id, "userId", role FROM "ChannelMember" WHERE id = $1::uuid AND "channelId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE`,
        data.targetMemberId,
        data.channelId,
      );
      if (
        !lockedTargetMember ||
        lockedTargetMember.length === 0 ||
        lockedTargetMember[0].userId !== data.targetUserId ||
        lockedTargetMember[0].role === 'OWNER' ||
        lockedTargetMember[0].userId === data.currentOwnerUserId
      ) {
        throw new Error('TARGET_STATE_CHANGED');
      }

      // Lock the target user row to serialize against account deletion scheduling.
      const lockedTargetUser = await tx.$queryRawUnsafe<
        Array<{ id: string; status: string }>
      >(
        `SELECT id, status FROM "User" WHERE id = $1::uuid AND status = 'ACTIVE' FOR UPDATE`,
        data.targetUserId,
      );
      if (!lockedTargetUser || lockedTargetUser.length === 0) {
        throw new Error('TARGET_USER_NOT_ACTIVE');
      }

      const demote = await tx.channelMember.updateMany({
        where: {
          id: data.currentOwnerMemberId,
          channelId: data.channelId,
          role: 'OWNER',
          deletedAt: null,
        },
        data: { role: 'ADMIN' },
      });
      if (demote.count !== 1) {
        throw new Error('OWNERSHIP_STATE_CHANGED');
      }

      const promote = await tx.channelMember.updateMany({
        where: {
          id: data.targetMemberId,
          channelId: data.channelId,
          deletedAt: null,
          role: { in: ['ADMIN', 'MEMBER'] },
        },
        data: { role: 'OWNER' },
      });
      if (promote.count !== 1) {
        throw new Error('TARGET_STATE_CHANGED');
      }

      return {
        channelId: data.channelId,
        previousOwner: {
          id: data.currentOwnerMemberId,
          userId: data.currentOwnerUserId,
          role: 'ADMIN' as const,
        },
        newOwner: {
          id: data.targetMemberId,
          userId: data.targetUserId,
          role: 'OWNER' as const,
        },
      };
    });
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
          permanentlyDeletedAt: null,
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
