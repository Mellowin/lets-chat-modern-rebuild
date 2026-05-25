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
      const markResult = await tx.invitation.updateMany({
        where: {
          id: inviteId,
          deletedAt: null,
          usedAt: null,
          usedById: null,
        },
        data: { usedAt: new Date(), usedById: userId },
      });

      if (markResult.count === 0) {
        throw new Error('INVITE_ALREADY_USED_OR_REVOKED');
      }

      const member = await tx.workspaceMember.create({
        data: { workspaceId, userId, role },
      });

      return member;
    });
  }

  async findById(id: string) {
    return this.prisma.invitation.findUnique({
      where: { id },
    });
  }

  async softDeleteIfUnused(id: string, deletedAt: Date): Promise<number> {
    const result = await this.prisma.invitation.updateMany({
      where: {
        id,
        deletedAt: null,
        usedAt: null,
        usedById: null,
      },
      data: { deletedAt },
    });
    return result.count;
  }

  async listForWorkspace(workspaceId: string) {
    return this.prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingByEmail(email: string) {
    return this.prisma.invitation.findMany({
      where: {
        invitedEmail: email.toLowerCase(),
        deletedAt: null,
        usedAt: null,
        usedById: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true },
        },
        invitedBy: {
          select: { id: true, username: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingById(id: string) {
    return this.prisma.invitation.findUnique({
      where: { id },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true },
        },
        invitedBy: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });
  }

  async findPendingByWorkspaceAndEmail(workspaceId: string, email: string) {
    return this.prisma.invitation.findFirst({
      where: {
        workspaceId,
        invitedEmail: email.toLowerCase(),
        deletedAt: null,
        usedAt: null,
        usedById: null,
        expiresAt: { gt: new Date() },
      },
    });
  }
}
