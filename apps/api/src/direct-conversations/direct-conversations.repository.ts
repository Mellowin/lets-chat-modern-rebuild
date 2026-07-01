import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { buildMessageCursorWhereClause } from '../common/cursor-pagination';

interface CreateConversationInput {
  key: string;
  participantIds: string[];
}

interface CreateMessageInput {
  conversationId: string;
  authorId: string;
  content: string;
  parentId?: string;
  mentions?: { userId: string; username: string }[];
}

export type DirectConversationWithParticipants = NonNullable<
  Awaited<ReturnType<DirectConversationsRepository['findById']>>
>;

export type DirectMessageWithAuthorAndParent = Awaited<
  ReturnType<DirectConversationsRepository['createMessage']>
>;

@Injectable()
export class DirectConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(key: string) {
    return this.prisma.directConversation.findUnique({
      where: { key },
      include: {
        participants: {
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
          where: { deletedAt: null },
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
    return this.prisma.directConversation.findUnique({
      where: { id },
      include: {
        participants: {
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
          where: { deletedAt: null },
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

  async createConversation(data: CreateConversationInput) {
    return this.prisma.directConversation.create({
      data: {
        key: data.key,
        participants: {
          create: data.participantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: {
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
          where: { deletedAt: null },
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
    return this.prisma.directConversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: {
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
          where: { deletedAt: null },
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

  async findParticipant(conversationId: string, userId: string) {
    return this.prisma.directConversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });
  }

  async findParticipants(conversationId: string) {
    return this.prisma.directConversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true, lastReadAt: true },
    });
  }

  async findMentionableUserIds(
    conversationId: string,
    senderId: string,
  ): Promise<string[]> {
    const participants =
      await this.prisma.directConversationParticipant.findMany({
        where: { conversationId, userId: { not: senderId } },
        select: { userId: true },
      });
    return participants.map((p) => p.userId);
  }

  async updateParticipantLastRead(conversationId: string, userId: string) {
    return this.prisma.directConversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });
  }

  async countUnreadMessages(
    conversationId: string,
    userId: string,
    lastReadAt: Date | null,
  ) {
    return this.prisma.directMessage.count({
      where: {
        conversationId,
        authorId: { not: userId },
        deletedAt: null,
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
  }

  async createMessage(data: CreateMessageInput) {
    return this.prisma.directMessage.create({
      data: {
        conversationId: data.conversationId,
        authorId: data.authorId,
        content: data.content,
        parentId: data.parentId,
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
        parent: {
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
        },
      },
    });
  }

  async findMessageById(id: string) {
    return this.prisma.directMessage.findUnique({
      where: { id },
    });
  }

  async listMessagesForConversation(
    conversationId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ) {
    return this.prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
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
        parent: {
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
        },
      },
    });
  }

  async touchConversationUpdatedAt(conversationId: string) {
    return this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  async findDirectReaction(messageId: string, userId: string, emoji: string) {
    return this.prisma.directMessageReaction.findFirst({
      where: { messageId, userId, emoji },
    });
  }

  async createDirectReaction(data: {
    messageId: string;
    userId: string;
    emoji: string;
  }) {
    return this.prisma.directMessageReaction.create({ data });
  }

  async deleteDirectReaction(id: string) {
    return this.prisma.directMessageReaction.delete({ where: { id } });
  }

  async deleteDirectReactionsForUser(messageId: string, userId: string) {
    return this.prisma.directMessageReaction.deleteMany({
      where: { messageId, userId },
    });
  }

  async softDeleteDirectMessage(id: string) {
    return this.prisma.directMessage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async updateDirectMessageContent(messageId: string, content: string) {
    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        parent: {
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
        },
      },
    });
  }

  async getDirectMessageReactions(messageId: string, currentUserId: string) {
    const [groups, userReactions] = await Promise.all([
      this.prisma.directMessageReaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { emoji: true },
      }),
      this.prisma.directMessageReaction.findMany({
        where: { messageId, userId: currentUserId },
        select: { emoji: true },
      }),
    ]);

    const userEmojiSet = new Set(userReactions.map((r) => r.emoji));

    return groups.map((g) => ({
      emoji: g.emoji,
      count: g._count.emoji,
      reactedByMe: userEmojiSet.has(g.emoji),
    }));
  }
}
