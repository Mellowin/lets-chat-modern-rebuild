import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { randomBytes, createHash } from 'crypto';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { InvitesRepository } from './invites.repository';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';

@Injectable()
export class InvitesService {
  constructor(
    private readonly invites: InvitesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  async create(workspaceId: string, dto: CreateInviteDto, invitedById: string) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const role = await this.workspaces.findMemberRole(workspaceId, invitedById);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    if ((dto.role as string) === 'OWNER') {
      throw new BadRequestException('Cannot create OWNER invite');
    }
    if (role === 'ADMIN' && dto.role === 'ADMIN') {
      throw new ForbiddenException('Admin can only invite members');
    }

    if (!dto.email && !dto.identifier) {
      throw new BadRequestException('Email or identifier is required');
    }
    if (dto.email && dto.identifier) {
      throw new BadRequestException(
        'Provide either email or identifier, not both',
      );
    }

    let resolvedEmail: string;
    let targetUserId: string | undefined;

    if (dto.email) {
      resolvedEmail = dto.email;
      const targetUser = await this.users.findByEmail(resolvedEmail);
      if (targetUser) {
        targetUserId = targetUser.id;
      }
    } else {
      const identifier = dto.identifier!.replace(/^@/, '');
      const targetUser = await this.users.findByUsername(identifier);
      if (!targetUser) {
        throw new NotFoundException('User not found');
      }
      resolvedEmail = targetUser.email;
      targetUserId = targetUser.id;
    }

    const existingPending = await this.invites.findPendingByWorkspaceAndEmail(
      workspaceId,
      resolvedEmail,
    );
    if (existingPending) {
      throw new ConflictException('Invitation already sent');
    }

    if (targetUserId) {
      const existingMember = await this.workspaces.findActiveMemberByUserId(
        workspaceId,
        targetUserId,
      );
      if (existingMember) {
        throw new ConflictException('Already a member of this workspace');
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.invites.createInvite({
      workspaceId,
      invitedById,
      invitedEmail: resolvedEmail,
      role: dto.role,
      tokenHash,
      expiresAt,
    });

    await this.audit.record({
      actorId: invitedById,
      action: AuditAction.WORKSPACE_INVITE_CREATED,
      entityType: AuditEntityType.INVITATION,
      entityId: invite.id,
      workspaceId,
      metadata: {
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    });

    return {
      id: invite.id,
      workspaceId: invite.workspaceId,
      email: invite.invitedEmail,
      role: invite.role,
      token: rawToken,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async accept(token: string, userId: string, userEmail: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const invite = await this.invites.findByTokenHash(tokenHash);
    if (!invite || invite.deletedAt) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.usedAt || invite.usedById) {
      throw new ConflictException('Invite already used');
    }

    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite expired');
    }

    if (
      invite.invitedEmail &&
      invite.invitedEmail !== userEmail.toLowerCase()
    ) {
      throw new ForbiddenException('Email mismatch');
    }

    if (invite.role === 'OWNER') {
      throw new BadRequestException('Cannot accept OWNER invite');
    }

    const workspace = await this.workspaces.findActiveById(invite.workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const existingRole = await this.workspaces.findMemberRole(
      invite.workspaceId,
      userId,
    );
    if (existingRole) {
      throw new ConflictException('Already a member of this workspace');
    }

    try {
      const member = await this.invites.acceptInvite(
        invite.id,
        userId,
        invite.workspaceId,
        invite.role,
      );

      await this.audit.record({
        actorId: userId,
        action: AuditAction.WORKSPACE_INVITE_ACCEPTED,
        entityType: AuditEntityType.INVITATION,
        entityId: invite.id,
        workspaceId: invite.workspaceId,
        metadata: {
          role: invite.role,
        },
      });

      return {
        workspaceId: member.workspaceId,
        role: member.role,
        joinedAt: member.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Already a member of this workspace');
      }
      if (
        error instanceof Error &&
        error.message === 'INVITE_ALREADY_USED_OR_REVOKED'
      ) {
        const current = await this.invites.findById(invite.id);
        if (!current || current.deletedAt) {
          throw new NotFoundException('Invite not found');
        }
        if (current.usedAt || current.usedById) {
          throw new ConflictException('Invite already used');
        }
        throw new NotFoundException('Invite not found');
      }
      throw error;
    }
  }

  async revoke(workspaceId: string, inviteId: string, userId: string) {
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

    const invite = await this.invites.findById(inviteId);
    if (!invite || invite.deletedAt) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.workspaceId !== workspaceId) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.usedAt || invite.usedById) {
      throw new ConflictException('Invite already used');
    }

    const revokedAt = new Date();
    const deletedCount = await this.invites.softDeleteIfUnused(
      inviteId,
      revokedAt,
    );
    if (deletedCount === 0) {
      const current = await this.invites.findById(inviteId);
      if (!current || current.deletedAt) {
        throw new NotFoundException('Invite not found');
      }
      if (current.usedAt || current.usedById) {
        throw new ConflictException('Invite already used');
      }
      throw new NotFoundException('Invite not found');
    }

    await this.audit.record({
      actorId: userId,
      action: AuditAction.WORKSPACE_INVITE_REVOKED,
      entityType: AuditEntityType.INVITATION,
      entityId: inviteId,
      workspaceId,
      metadata: {
        role: invite.role,
      },
    });

    return { id: inviteId, deletedAt: revokedAt };
  }

  async listPending(userId: string, userEmail: string) {
    const invites = await this.invites.findPendingByEmail(userEmail);
    return invites.map((invite) => ({
      id: invite.id,
      workspace: invite.workspace,
      invitedBy: invite.invitedBy,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }));
  }

  async acceptById(inviteId: string, userId: string, userEmail: string) {
    const invite = await this.invites.findPendingById(inviteId);
    if (!invite || invite.deletedAt) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.usedAt || invite.usedById) {
      throw new ConflictException('Invite already used');
    }

    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite expired');
    }

    if (
      invite.invitedEmail &&
      invite.invitedEmail !== userEmail.toLowerCase()
    ) {
      throw new ForbiddenException('Email mismatch');
    }

    if (invite.role === 'OWNER') {
      throw new BadRequestException('Cannot accept OWNER invite');
    }

    const workspace = await this.workspaces.findActiveById(invite.workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const existingRole = await this.workspaces.findMemberRole(
      invite.workspaceId,
      userId,
    );
    if (existingRole) {
      throw new ConflictException('Already a member of this workspace');
    }

    try {
      const member = await this.invites.acceptInvite(
        invite.id,
        userId,
        invite.workspaceId,
        invite.role,
      );

      await this.audit.record({
        actorId: userId,
        action: AuditAction.WORKSPACE_INVITE_ACCEPTED,
        entityType: AuditEntityType.INVITATION,
        entityId: invite.id,
        workspaceId: invite.workspaceId,
        metadata: {
          role: invite.role,
        },
      });

      return {
        workspaceId: member.workspaceId,
        role: member.role,
        joinedAt: member.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Already a member of this workspace');
      }
      if (
        error instanceof Error &&
        error.message === 'INVITE_ALREADY_USED_OR_REVOKED'
      ) {
        const current = await this.invites.findById(invite.id);
        if (!current || current.deletedAt) {
          throw new NotFoundException('Invite not found');
        }
        if (current.usedAt || current.usedById) {
          throw new ConflictException('Invite already used');
        }
        throw new NotFoundException('Invite not found');
      }
      throw error;
    }
  }

  async decline(inviteId: string, userId: string, userEmail: string) {
    const invite = await this.invites.findPendingById(inviteId);
    if (!invite || invite.deletedAt) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.usedAt || invite.usedById) {
      throw new ConflictException('Invite already used');
    }

    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite expired');
    }

    if (
      invite.invitedEmail &&
      invite.invitedEmail !== userEmail.toLowerCase()
    ) {
      throw new ForbiddenException('Email mismatch');
    }

    const declinedAt = new Date();
    const deletedCount = await this.invites.softDeleteIfUnused(
      inviteId,
      declinedAt,
    );
    if (deletedCount === 0) {
      const current = await this.invites.findById(inviteId);
      if (!current || current.deletedAt) {
        throw new NotFoundException('Invite not found');
      }
      if (current.usedAt || current.usedById) {
        throw new ConflictException('Invite already used');
      }
      throw new NotFoundException('Invite not found');
    }

    await this.audit.record({
      actorId: userId,
      action: AuditAction.WORKSPACE_INVITE_DECLINED,
      entityType: AuditEntityType.INVITATION,
      entityId: inviteId,
      workspaceId: invite.workspaceId,
      metadata: {
        role: invite.role,
      },
    });

    return { id: inviteId, deletedAt: declinedAt };
  }

  async list(workspaceId: string, userId: string) {
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

    const invites = await this.invites.listForWorkspace(workspaceId);
    return invites.map((invite) => ({
      id: invite.id,
      workspaceId: invite.workspaceId,
      email: invite.invitedEmail,
      role: invite.role,
      status: this.mapInviteStatus(invite),
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
      deletedAt: invite.deletedAt,
      createdAt: invite.createdAt,
    }));
  }

  private mapInviteStatus(invite: {
    deletedAt: Date | null;
    usedAt: Date | null;
    usedById: string | null;
    expiresAt: Date;
  }): 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED' {
    if (invite.deletedAt) return 'REVOKED';
    if (invite.usedAt || invite.usedById) return 'USED';
    if (invite.expiresAt < new Date()) return 'EXPIRED';
    return 'PENDING';
  }
}
