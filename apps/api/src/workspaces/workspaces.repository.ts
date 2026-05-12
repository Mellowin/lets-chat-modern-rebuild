import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

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
}
