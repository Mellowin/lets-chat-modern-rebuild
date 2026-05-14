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
}
