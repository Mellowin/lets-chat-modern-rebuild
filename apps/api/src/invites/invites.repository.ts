import { Injectable } from '@nestjs/common';
import { PrismaService, WorkspaceRole } from '@lets-chat/database';

@Injectable()
export class InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInvite(data: {
    workspaceId: string;
    invitedById: string;
    invitedEmail: string;
    role: WorkspaceRole;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.invitation.create({ data });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.invitation.findUnique({
      where: { tokenHash },
    });
  }

  async acceptInvite(
    inviteId: string,
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.create({
        data: { workspaceId, userId, role },
      });

      await tx.invitation.update({
        where: { id: inviteId },
        data: { usedAt: new Date(), usedById: userId },
      });

      return member;
    });
  }

  async findById(id: string) {
    return this.prisma.invitation.findUnique({
      where: { id },
    });
  }

  async softDeleteIfUnused(id: string): Promise<number> {
    const result = await this.prisma.invitation.updateMany({
      where: {
        id,
        deletedAt: null,
        usedAt: null,
        usedById: null,
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }
}
