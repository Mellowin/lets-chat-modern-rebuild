import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

export interface BlockWithBlocked {
  id: string;
  blockerId: string;
  blockedId: string;
  reason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  blocked: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

@Injectable()
export class BlocksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertBlock(
    blockerId: string,
    blockedId: string,
    reason?: string,
  ): Promise<BlockWithBlocked> {
    const existing = await this.prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    if (existing) {
      return this.prisma.userBlock.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          reason: reason ?? existing.reason,
        },
        include: {
          blocked: {
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

    return this.prisma.userBlock.create({
      data: {
        blockerId,
        blockedId,
        reason: reason ?? null,
      },
      include: {
        blocked: {
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

  async softDeleteBlock(blockerId: string, blockedId: string): Promise<number> {
    const result = await this.prisma.userBlock.updateMany({
      where: {
        blockerId,
        blockedId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    return result.count;
  }

  async findActiveBlock(
    blockerId: string,
    blockedId: string,
  ): Promise<BlockWithBlocked | null> {
    return this.prisma.userBlock.findFirst({
      where: {
        blockerId,
        blockedId,
        deletedAt: null,
      },
      include: {
        blocked: {
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

  async findActiveBlockInEitherDirection(
    userAId: string,
    userBId: string,
  ): Promise<BlockWithBlocked | null> {
    return this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId, deletedAt: null },
          { blockerId: userBId, blockedId: userAId, deletedAt: null },
        ],
      },
      include: {
        blocked: {
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

  async findBlockerIdsWhoBlockedUser(blockedId: string): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        blockedId,
        deletedAt: null,
      },
      select: { blockerId: true },
    });
    return blocks.map((b) => b.blockerId);
  }

  async findActiveByBlocker(blockerId: string): Promise<BlockWithBlocked[]> {
    return this.prisma.userBlock.findMany({
      where: {
        blockerId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
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
}
