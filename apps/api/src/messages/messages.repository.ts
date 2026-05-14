import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

interface CreateMessageInput {
  channelId: string;
  authorId: string;
  content: string;
  parentId?: string;
}

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMessage(data: CreateMessageInput) {
    return this.prisma.message.create({
      data: {
        channelId: data.channelId,
        authorId: data.authorId,
        content: data.content,
        parentId: data.parentId,
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
      },
    });
  }

  async updateMessage(messageId: string, oldContent: string, newContent: string, editedById: string) {
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
