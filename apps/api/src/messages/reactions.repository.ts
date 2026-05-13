import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

@Injectable()
export class ReactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(messageId: string, userId: string, emoji: string) {
    return this.prisma.reaction.findFirst({
      where: { messageId, userId, emoji, deletedAt: null },
    });
  }

  async findDeleted(messageId: string, userId: string, emoji: string) {
    return this.prisma.reaction.findFirst({
      where: { messageId, userId, emoji, deletedAt: { not: null } },
    });
  }

  async create(data: { messageId: string; userId: string; emoji: string }) {
    return this.prisma.reaction.create({ data });
  }

  async restore(id: string) {
    return this.prisma.reaction.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async softDelete(id: string) {
    return this.prisma.reaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listWithCounts(messageId: string, userId: string) {
    const [groups, userReactions] = await Promise.all([
      this.prisma.reaction.groupBy({
        by: ['emoji'],
        where: { messageId, deletedAt: null },
        _count: { emoji: true },
      }),
      this.prisma.reaction.findMany({
        where: { messageId, userId, deletedAt: null },
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
