import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

interface CreateConversationInput {
  key: string;
  participantIds: string[];
}

interface CreateMessageInput {
  conversationId: string;
  authorId: string;
  content: string;
  parentId?: string;
}

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

  async createMessage(data: CreateMessageInput) {
    return this.prisma.directMessage.create({
      data: {
        conversationId: data.conversationId,
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

  async listMessagesForConversation(conversationId: string) {
    return this.prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
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
}
