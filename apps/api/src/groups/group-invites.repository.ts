import { Injectable } from '@nestjs/common';
import { GroupRole, PrismaService } from '@lets-chat/database';

interface CreateInviteInput {
  groupId: string;
  createdById: string;
  tokenHash: string;
  expiresAt: Date | null;
  maxUses: number | null;
  roleOnJoin: GroupRole;
}

@Injectable()
export class GroupInvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInvite(input: CreateInviteInput) {
    return this.prisma.groupInviteLink.create({
      data: {
        groupId: input.groupId,
        createdById: input.createdById,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
        roleOnJoin: input.roleOnJoin,
      },
    });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.groupInviteLink.findUnique({
      where: { tokenHash },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            archivedAt: true,
          },
        },
      },
    });
  }

  async findById(inviteId: string) {
    return this.prisma.groupInviteLink.findUnique({
      where: { id: inviteId },
    });
  }

  async listForGroup(groupId: string) {
    return this.prisma.groupInviteLink.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(inviteId: string) {
    const result = await this.prisma.groupInviteLink.updateMany({
      where: {
        id: inviteId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return result.count;
  }

  async incrementUseCount(inviteId: string) {
    return this.prisma.groupInviteLink.update({
      where: { id: inviteId },
      data: {
        useCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }
}
