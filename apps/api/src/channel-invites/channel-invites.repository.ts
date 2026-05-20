import { Injectable } from '@nestjs/common';
import { PrismaService, ChannelRole } from '@lets-chat/database';

@Injectable()
export class ChannelInvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInvite(data: {
    workspaceId: string;
    channelId: string;
    invitedById: string;
    invitedEmail: string;
    role: ChannelRole;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.channelInvitation.create({ data });
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.channelInvitation.findUnique({
      where: { tokenHash },
    });
  }

  async findById(id: string) {
    return this.prisma.channelInvitation.findUnique({
      where: { id },
    });
  }

  async findPendingById(id: string) {
    return this.prisma.channelInvitation.findUnique({
      where: { id },
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        channel: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  async findPendingByEmail(email: string) {
    return this.prisma.channelInvitation.findMany({
      where: {
        invitedEmail: email.toLowerCase(),
        deletedAt: null,
        usedAt: null,
        usedById: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        channel: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingByChannelAndEmail(channelId: string, email: string) {
    return this.prisma.channelInvitation.findFirst({
      where: {
        channelId,
        invitedEmail: email.toLowerCase(),
        deletedAt: null,
        usedAt: null,
        usedById: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async acceptInvite(
    inviteId: string,
    userId: string,
    channelId: string,
    role: ChannelRole,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const markResult = await tx.channelInvitation.updateMany({
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

      const member = await tx.channelMember.create({
        data: { channelId, userId, role },
      });

      return member;
    });
  }

  async softDeleteIfUnused(id: string, deletedAt: Date): Promise<number> {
    const result = await this.prisma.channelInvitation.updateMany({
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

  async listForChannel(channelId: string) {
    return this.prisma.channelInvitation.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
