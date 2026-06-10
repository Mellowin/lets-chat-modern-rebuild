import { Injectable } from '@nestjs/common';
import { PrismaService, StorageBackend } from '@lets-chat/database';

interface CreateMessageInput {
  channelId: string;
  authorId: string;
  content: string;
  parentId?: string;
  attachments?: Array<{
    storageKey: string;
    filename: string;
    mimeType: string;
    size: number;
    createdById: string;
  }>;
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
              createdAt: true,
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

  async listForChannel(channelId: string, limit: number, before?: Date) {
    return this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
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
            createdAt: true,
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
              createdAt: true,
            },
          },
        },
      }),
    ]);
    return updated;
  }

  async softDeleteMessage(id: string) {
    return this.prisma.message.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
