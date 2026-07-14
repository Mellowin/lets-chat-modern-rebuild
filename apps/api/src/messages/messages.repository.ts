import { Injectable } from '@nestjs/common';
import { PrismaService, StorageBackend, Prisma } from '@lets-chat/database';
import {
  buildMessageCursorWhereClause,
  buildPinCursorWhereClause,
} from '../common/cursor-pagination';

interface CreateMessageInput {
  channelId: string;
  authorId: string;
  content: string;
  parentId?: string;
  replyToMessageId?: string;
  attachments?: Array<{
    storageKey: string;
    filename: string;
    mimeType: string;
    size: number;
    createdById: string;
  }>;
  mentions?: { userId: string; username: string }[];
  forwardedFrom?: Prisma.InputJsonValue;
}

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMessage(data: CreateMessageInput) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          channelId: data.channelId,
          authorId: data.authorId,
          content: data.content,
          parentId: data.parentId,
          replyToMessageId: data.replyToMessageId,
          mentions: data.mentions as never,
          forwardedFrom: data.forwardedFrom as never,
        },
      });

      if (data.attachments?.length) {
        await tx.attachment.createMany({
          data: data.attachments.map((a) => ({
            messageId: message.id,
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

      const result = await tx.message.findUnique({
        where: { id: message.id },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          reactions: {
            where: { deletedAt: null },
            select: { emoji: true, userId: true },
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
          pin: {
            select: {
              pinnedAt: true,
              pinnedByUserId: true,
            },
          },
        },
      });

      if (!result) {
        throw new Error('Message not found after creation');
      }

      return result;
    });
  }

  async findById(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
    });
  }

  async listForChannel(
    channelId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ) {
    return this.prisma.message.findMany({
      where: {
        channelId,
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
        reactions: {
          where: { deletedAt: null },
          select: { emoji: true, userId: true },
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
        pin: {
          select: {
            pinnedAt: true,
            pinnedByUserId: true,
          },
        },
      },
    });
  }

  async updateMessage(
    messageId: string,
    oldContent: string,
    newContent: string,
    editedById: string,
  ) {
    const [, updated] = await this.prisma.$transaction([
      this.prisma.messageEdit.create({
        data: { messageId, oldContent, newContent, editedById },
      }),
      this.prisma.message.update({
        where: { id: messageId },
        data: { content: newContent, editedAt: new Date() },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          reactions: {
            where: { deletedAt: null },
            select: { emoji: true, userId: true },
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
          pin: {
            select: {
              pinnedAt: true,
              pinnedByUserId: true,
            },
          },
        },
      }),
    ]);
    return updated;
  }

  async softDeleteMessage(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.pinnedChannelMessage.deleteMany({
        where: { messageId: id },
      });
      return tx.message.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  async pinMessage(
    channelId: string,
    messageId: string,
    pinnedByUserId: string,
  ) {
    return this.prisma.pinnedChannelMessage.upsert({
      where: { messageId },
      create: {
        messageId,
        channelId,
        pinnedByUserId,
      },
      update: {},
      include: {
        pinnedBy: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        message: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            attachments: {
              where: { deletedAt: null },
              select: {
                id: true,
                filename: true,
                mimeType: true,
                size: true,
                createdAt: true,
              },
            },
            replyToMessage: {
              select: {
                id: true,
                content: true,
                deletedAt: true,
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
        },
      },
    });
  }

  async unpinMessage(messageId: string) {
    return this.prisma.pinnedChannelMessage.deleteMany({
      where: { messageId },
    });
  }

  async findPinnedMessages(
    channelId: string,
    limit: number,
    cursor?: { pinnedAt: Date; id: string },
  ) {
    return this.prisma.pinnedChannelMessage.findMany({
      where: {
        channelId,
        ...(cursor ? { OR: buildPinCursorWhereClause(cursor) } : {}),
      },
      orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        pinnedBy: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        message: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            attachments: {
              where: { deletedAt: null },
              select: {
                id: true,
                filename: true,
                mimeType: true,
                size: true,
                createdAt: true,
              },
            },
            replyToMessage: {
              select: {
                id: true,
                content: true,
                deletedAt: true,
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
        },
      },
    });
  }

  async searchChannelMessages(
    channelId: string,
    q: string,
    limit: number,
    cursor?: string,
  ) {
    return this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        reactions: {
          where: { deletedAt: null },
          select: { emoji: true, userId: true },
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
        pin: {
          select: {
            pinnedAt: true,
            pinnedByUserId: true,
          },
        },
      },
    });
  }

  async findByIdWithRelations(id: string) {
    return this.prisma.message.findUnique({
      where: { id, deletedAt: null },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        reactions: {
          where: { deletedAt: null },
          select: { emoji: true, userId: true },
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
        pin: {
          select: {
            pinnedAt: true,
            pinnedByUserId: true,
          },
        },
      },
    });
  }

  async findContextBefore(
    channelId: string,
    targetCreatedAt: Date,
    limit: number,
  ) {
    return this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
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
        reactions: {
          where: { deletedAt: null },
          select: { emoji: true, userId: true },
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
        pin: {
          select: {
            pinnedAt: true,
            pinnedByUserId: true,
          },
        },
      },
    });
  }

  async findContextAfter(
    channelId: string,
    targetCreatedAt: Date,
    limit: number,
  ) {
    return this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
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
        reactions: {
          where: { deletedAt: null },
          select: { emoji: true, userId: true },
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
        pin: {
          select: {
            pinnedAt: true,
            pinnedByUserId: true,
          },
        },
      },
    });
  }
}
