import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

@Injectable()
export class ReadReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: {
    messageId: string;
    userId: string;
    channelId: string;
  }) {
    return this.prisma.readReceipt.upsert({
      where: {
        messageId_userId: {
          messageId: data.messageId,
          userId: data.userId,
        },
      },
      update: { readAt: new Date() },
      create: {
        messageId: data.messageId,
        userId: data.userId,
        channelId: data.channelId,
        readAt: new Date(),
      },
    });
  }

  async listForMessage(messageId: string) {
    return this.prisma.readReceipt.findMany({
      where: { messageId },
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
      orderBy: { readAt: 'desc' },
    });
  }
}
