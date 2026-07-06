import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { buildMessageCursorWhereClause } from '../common/cursor-pagination';

interface CreateGroupInput {
  name: string;
  createdById: string;
  memberIds: string[];
}

interface CreateMessageInput {
  groupId: string;
  authorId: string;
  content: string;
  mentions?: { userId: string; username: string }[];
}

export type GroupWithMembersAndLastMessage = NonNullable<
  Awaited<ReturnType<GroupsRepository['findById']>>
>;

export type GroupMessageWithAuthor = Awaited<
  ReturnType<GroupsRepository['createMessage']>
>;

@Injectable()
export class GroupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateGroupInput) {
    return this.prisma.groupConversation.create({
      data: {
        name: data.name,
        createdById: data.createdById,
        members: {
          create: [
            { userId: data.createdById, role: 'OWNER' },
            ...data.memberIds.map((userId) => ({
              userId,
              role: 'MEMBER' as const,
            })),
          ],
        },
      },
      include: {
        members: {
          where: { leftAt: null },
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
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            authorId: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.groupConversation.findUnique({
      where: { id },
      include: {
        members: {
          where: { leftAt: null },
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
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            authorId: true,
          },
        },
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.groupConversation.findMany({
      where: {
        archivedAt: null,
        members: {
          some: {
            userId,
            leftAt: null,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: {
          where: { leftAt: null },
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
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            authorId: true,
          },
        },
      },
    });
  }

  async updateName(id: string, name: string) {
    return this.prisma.groupConversation.update({
      where: { id },
      data: { name, updatedAt: new Date() },
      include: {
        members: {
          where: { leftAt: null },
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
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            authorId: true,
          },
        },
      },
    });
  }

  async archive(id: string) {
    return this.prisma.groupConversation.update({
      where: { id },
      data: { archivedAt: new Date(), updatedAt: new Date() },
    });
  }

  async findMember(groupId: string, userId: string) {
    return this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  async findActiveMember(groupId: string, userId: string) {
    return this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        leftAt: null,
      },
    });
  }

  async listActiveMembers(groupId: string) {
    return this.prisma.groupMember.findMany({
      where: {
        groupId,
        leftAt: null,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        joinedAt: true,
        lastReadAt: true,
      },
    });
  }

  async findMentionableUserIds(groupId: string): Promise<string[]> {
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId,
        leftAt: null,
      },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  async addMember(groupId: string, userId: string) {
    return this.prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      create: {
        groupId,
        userId,
        role: 'MEMBER',
      },
      update: {
        leftAt: null,
        role: 'MEMBER',
      },
    });
  }

  async removeMember(groupId: string, userId: string) {
    return this.prisma.groupMember.updateMany({
      where: {
        groupId,
        userId,
        leftAt: null,
      },
      data: { leftAt: new Date() },
    });
  }

  async leave(groupId: string, userId: string) {
    return this.removeMember(groupId, userId);
  }

  async countActiveMembers(groupId: string) {
    return this.prisma.groupMember.count({
      where: {
        groupId,
        leftAt: null,
      },
    });
  }

  async countOwners(groupId: string) {
    return this.prisma.groupMember.count({
      where: {
        groupId,
        leftAt: null,
        role: 'OWNER',
      },
    });
  }

  async transferOwnership(
    groupId: string,
    fromUserId: string,
    toUserId: string,
  ) {
    await this.prisma.groupMember.updateMany({
      where: {
        groupId,
        userId: fromUserId,
        role: 'OWNER',
        leftAt: null,
      },
      data: { role: 'MEMBER' },
    });
    await this.prisma.groupMember.updateMany({
      where: {
        groupId,
        userId: toUserId,
        leftAt: null,
      },
      data: { role: 'OWNER' },
    });
  }

  async updateLastRead(groupId: string, userId: string) {
    return this.prisma.groupMember.updateMany({
      where: {
        groupId,
        userId,
        leftAt: null,
      },
      data: { lastReadAt: new Date() },
    });
  }

  async countUnreadMessages(
    groupId: string,
    userId: string,
    lastReadAt: Date | null,
  ) {
    return this.prisma.groupMessage.count({
      where: {
        groupId,
        authorId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
  }

  async createMessage(data: CreateMessageInput) {
    return this.prisma.groupMessage.create({
      data: {
        groupId: data.groupId,
        authorId: data.authorId,
        content: data.content,
        mentions: data.mentions as never,
      },
      include: {
        author: {
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

  async findMessageByIdWithRelations(id: string) {
    return this.prisma.groupMessage.findUnique({
      where: { id },
      include: {
        author: {
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

  async findContextBefore(
    groupId: string,
    targetCreatedAt: Date,
    limit: number,
  ) {
    return this.prisma.groupMessage.findMany({
      where: {
        groupId,
        createdAt: { lt: targetCreatedAt },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        author: {
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

  async findContextAfter(
    groupId: string,
    targetCreatedAt: Date,
    limit: number,
  ) {
    return this.prisma.groupMessage.findMany({
      where: {
        groupId,
        createdAt: { gt: targetCreatedAt },
      },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      include: {
        author: {
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

  async listMessages(
    groupId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ) {
    return this.prisma.groupMessage.findMany({
      where: {
        groupId,
        ...(cursor ? { OR: buildMessageCursorWhereClause(cursor) } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        author: {
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

  async touchUpdatedAt(groupId: string) {
    return this.prisma.groupConversation.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });
  }
}
