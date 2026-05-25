import { Injectable } from '@nestjs/common';
import { PrismaService, WorkspaceRole } from '@lets-chat/database';

interface CreateWorkspaceInput {
  name: string;
  slug: string;
  ownerId: string;
}

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspaceWithOwner(data: CreateWorkspaceInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          slug: data.slug,
          ownerId: data.ownerId,
        },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: 'OWNER',
        },
      });
      return workspace;
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.workspace.findUnique({
      where: { slug },
    });
  }

  async findById(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        deletedAt: null,
        members: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listArchivedOwnedByUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        ownerId: userId,
        deletedAt: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findActiveById(id: string) {
    return this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findActiveBySlug(slug: string) {
    return this.prisma.workspace.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async findMemberRole(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRole | null> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
      },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async updateName(id: string, name: string) {
    return this.prisma.workspace.update({
      where: { id },
      data: { name },
    });
  }

  async archive(id: string) {
    return this.prisma.workspace.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludingArchived(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
    });
  }

  async restoreWorkspace(id: string) {
    const result = await this.prisma.workspace.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return result.count;
  }

  async listActiveMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async findActiveMemberById(memberId: string, workspaceId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async findActiveMemberByUserId(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async updateMemberRole(memberId: string, role: WorkspaceRole) {
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async softDeleteMember(memberId: string, workspaceId: string) {
    const result = await this.prisma.workspaceMember.updateMany({
      where: {
        id: memberId,
        workspaceId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  async softDeleteMemberByUserId(workspaceId: string, userId: string) {
    const result = await this.prisma.workspaceMember.updateMany({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  async createMember(data: {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
  }) {
    return this.prisma.workspaceMember.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async transferOwnership(data: {
    workspaceId: string;
    currentOwnerMemberId: string;
    currentOwnerUserId: string;
    targetMemberId: string;
    targetUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const downgrade = await tx.workspaceMember.updateMany({
        where: {
          id: data.currentOwnerMemberId,
          workspaceId: data.workspaceId,
          role: 'OWNER',
          deletedAt: null,
        },
        data: { role: 'ADMIN' },
      });
      if (downgrade.count === 0) {
        throw new Error('OWNERSHIP_STATE_CHANGED');
      }

      const promote = await tx.workspaceMember.updateMany({
        where: {
          id: data.targetMemberId,
          workspaceId: data.workspaceId,
          deletedAt: null,
          role: { in: ['ADMIN', 'MEMBER'] },
        },
        data: { role: 'OWNER' },
      });
      if (promote.count === 0) {
        throw new Error('TARGET_STATE_CHANGED');
      }

      const workspaceUpdate = await tx.workspace.updateMany({
        where: { id: data.workspaceId, deletedAt: null },
        data: { ownerId: data.targetUserId },
      });
      if (workspaceUpdate.count === 0) {
        throw new Error('WORKSPACE_STATE_CHANGED');
      }

      return {
        workspaceId: data.workspaceId,
        previousOwner: {
          id: data.currentOwnerMemberId,
          userId: data.currentOwnerUserId,
          role: 'ADMIN' as const,
        },
        newOwner: {
          id: data.targetMemberId,
          userId: data.targetUserId,
          role: 'OWNER' as const,
        },
      };
    });
  }
}
