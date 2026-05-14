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

  async findActiveById(id: string) {
    return this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
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

  async updateMemberRole(memberId: string, role: WorkspaceRole) {
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
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
}
