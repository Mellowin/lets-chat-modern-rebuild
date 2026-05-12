import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { WorkspacesRepository } from './workspaces.repository';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly workspaces: WorkspacesRepository) {}

  async create(dto: CreateWorkspaceDto, userId: string) {
    const normalizedSlug = dto.slug.trim().toLowerCase();
    const existing = await this.workspaces.findBySlug(normalizedSlug);
    if (existing) {
      throw new ConflictException('Slug already in use');
    }

    try {
      return await this.workspaces.createWorkspaceWithOwner(
        { name: dto.name.trim(), slug: normalizedSlug, ownerId: userId },
        userId,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Slug already in use');
      }
      throw error;
    }
  }

  async listForUser(userId: string) {
    return this.workspaces.listForUser(userId);
  }
}
