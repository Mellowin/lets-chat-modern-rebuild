import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { WorkspacesRepository } from './workspaces.repository';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

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

  async findById(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.workspaces.updateName(workspaceId, dto.name);
  }

  async archive(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    if (role !== 'OWNER') {
      throw new ForbiddenException('Only owner can archive workspace');
    }
    await this.workspaces.archive(workspaceId);
    return { success: true };
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    userId: string,
  ) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const requesterRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!requesterRole) {
      throw new NotFoundException('Workspace not found');
    }
    if (requesterRole !== 'OWNER') {
      throw new ForbiddenException('Only owner can update member roles');
    }

    if (dto.role === 'OWNER') {
      throw new BadRequestException('Cannot assign OWNER role');
    }

    const targetMember = await this.workspaces.findActiveMemberById(
      memberId,
      workspaceId,
    );
    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }
    if (targetMember.role === 'OWNER') {
      throw new BadRequestException('Cannot change role of current owner');
    }

    const updated = await this.workspaces.updateMemberRole(memberId, dto.role);
    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      role: updated.role,
      joinedAt: updated.createdAt,
      user: {
        id: updated.user.id,
        username: updated.user.username,
      },
    };
  }

  async listMembers(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const role = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }

    const members = await this.workspaces.listActiveMembers(workspaceId);
    return members.map((member) => ({
      id: member.id,
      workspaceId: member.workspaceId,
      role: member.role,
      joinedAt: member.createdAt,
      user: {
        id: member.user.id,
        username: member.user.username,
      },
    }));
  }
}
