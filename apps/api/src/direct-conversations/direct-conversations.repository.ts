import { Injectable } from '@nestjs/common';
import { PrismaService, StorageBackend, Prisma } from '@lets-chat/database';
import {
  buildMessageCursorWhereClause,
  buildPinCursorWhereClause,
} from '../common/cursor-pagination';

interface CreateConversationInput {
  key: string;
  participantIds: string[];
}

interface CreateMessageInput {
  conversationId: string;
  authorId: string;
  content: string;
  parentId?: string;
  replyToMessageId?: string;
  mentions?: { userId: string; username: string }[];
  attachmentIds?: string[];
  forwardedFrom?: Prisma.InputJsonValue;
  attachments?: Array<{
    storageKey: string;
    filename: string;
    mimeType: string;
    size: number;
    createdById: string;
  }>;
}

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const directMessageInclude = {
  author: {
    select: authorSelect,
  },
  parent: {
    include: {
      author: {
        select: authorSelect,
      },
    },
  },
  attachments: {
    where: { deletedAt: null },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      storageKey: true,
      storageBackend: true,
      createdAt: true,
    },
  },
  replyToMessage: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      author: { select: authorSelect },
    },
  },
  pin: {
    select: {
      pinnedAt: true,
      pinnedByUserId: true,
    },
  },
} as const;

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

  async findUnattachedAttachmentsByIds(ids: string[], userId: string) {
    if (ids.length === 0) return [];
    return this.prisma.attachment.findMany({
      where: {
        id: { in: ids },
        createdById: userId,
        deletedAt: null,
        messageId: null,
        directMessageId: null,
        groupMessageId: null,
      },
      select: { id: true },
    });
  }

  async createMessage(data: CreateMessageInput) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.directMessage.create({
        data: {
          conversationId: data.conversationId,
          authorId: data.authorId,
          content: data.content,
          parentId: data.parentId,
          replyToMessageId: data.replyToMessageId,
          mentions: data.mentions as never,
          forwardedFrom: data.forwardedFrom as never,
        },
      });

      if (data.attachmentIds?.length) {
        await tx.attachment.updateMany({
          where: { id: { in: data.attachmentIds } },
          data: { directMessageId: message.id },
        });
      }

      if (data.attachments?.length) {
        await tx.attachment.createMany({
          data: data.attachments.map((a) => ({
            directMessageId: message.id,
            createdById: a.createdById,
            filename: a.filename,
            originalName: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            storageKey: a.storageKey,
            storageBackend: StorageBackend.MINIO,
          })),
        });
      }

      const result = await tx.directMessage.findUnique({
        where: { id: message.id },
        include: directMessageInclude,
      });

      if (!result) {
        throw new Error('Direct message not found after creation');
      }

      return result;
    });
  }

  async findMessageById(id: string) {
    return this.prisma.directMessage.findUnique({
      where: { id },
    });
  }

  async findMessageByIdWithRelations(id: string) {
    return this.prisma.directMessage.findUnique({
      where: { id, deletedAt: null },
      include: directMessageInclude,
    });
  }

  async findContextBefore(
    conversationId: string,
    targetCreatedAt: Date,
    limit: number,
  ) {
    return this.prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        createdAt: { lt: targetCreatedAt },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: directMessageInclude,
    });
  }

  async findContextAfter(
    conversationId: string,
    targetCreatedAt: Date,
    limit: number,
  ) {
    return this.prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        createdAt: { gt: targetCreatedAt },
      },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      include: directMessageInclude,
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
      include: directMessageInclude,
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
    return this.prisma.$transaction(async (tx) => {
      await tx.pinnedDirectMessage.deleteMany({
        where: { messageId: id },
      });

      return tx.directMessage.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  async updateDirectMessageContent(messageId: string, content: string) {
    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: directMessageInclude,
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

  async pinMessage(
    conversationId: string,
    messageId: string,
    pinnedByUserId: string,
  ) {
    return this.prisma.pinnedDirectMessage.upsert({
      where: { messageId },
      create: {
        messageId,
        conversationId,
        pinnedByUserId,
      },
      update: {},
      include: {
        pinnedBy: {
          select: authorSelect,
        },
        message: {
          include: directMessageInclude,
        },
      },
    });
  }

  async unpinMessage(messageId: string) {
    return this.prisma.pinnedDirectMessage.deleteMany({
      where: { messageId },
    });
  }

  async findPinnedMessages(
    conversationId: string,
    limit: number,
    cursor?: { pinnedAt: Date; id: string },
  ) {
    return this.prisma.pinnedDirectMessage.findMany({
      where: {
        conversationId,
        ...(cursor ? { OR: buildPinCursorWhereClause(cursor) } : {}),
      },
      orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        pinnedBy: {
          select: authorSelect,
        },
        message: {
          include: directMessageInclude,
        },
      },
    });
  }
}
