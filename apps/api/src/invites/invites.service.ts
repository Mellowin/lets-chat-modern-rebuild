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

    if (dto.email && dto.identifier) {
      throw new BadRequestException(
        'Provide either email or identifier, not both',
      );
    }

    const hasTarget = dto.email || dto.identifier;
    const isPublicLink = !hasTarget;

    if (isPublicLink && dto.maxUses === undefined) {
      throw new BadRequestException(
        'Public invite link requires maxUses to be set',
      );
    }

    let resolvedEmail: string | null = null;
    let targetUserId: string | undefined;

    if (dto.email) {
      resolvedEmail = dto.email;
      const targetUser = await this.users.findByEmail(resolvedEmail);
      if (!targetUser) {
        throw new NotFoundException('User not found');
      }
      targetUserId = targetUser.id;
    } else if (dto.identifier) {
      const identifier = dto.identifier.replace(/^@/, '');
      const targetUser = await this.users.findByUsername(identifier);
      if (!targetUser) {
        throw new NotFoundException('User not found');
      }
      resolvedEmail = targetUser.email;
      targetUserId = targetUser.id;
    }

    if (resolvedEmail) {
      const existingPending = await this.invites.findPendingByWorkspaceAndEmail(
        workspaceId,
        resolvedEmail,
      );
      if (existingPending) {
        throw new ConflictException('Invitation already sent');
      }
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
      maxUses: isPublicLink ? (dto.maxUses ?? null) : null,
    });

    await this.audit.record({
      actorId: invitedById,
      action: AuditAction.WORKSPACE_INVITE_CREATED,
      entityType: AuditEntityType.INVITATION,
      entityId: invite.id,
      workspaceId,
      metadata: {
        role: invite.role,
        isPublicLink,
        maxUses: invite.maxUses,
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
      maxUses: invite.maxUses,
      createdAt: invite.createdAt,
    };
  }

  async accept(token: string, userId: string, userEmail: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const invite = await this.invites.findByTokenHash(tokenHash);
    if (!invite || invite.deletedAt) {
      throw new NotFoundException('Invite not found');
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
      return {
        workspaceId: invite.workspaceId,
        role: existingRole,
        joinedAt: null,
      };
    }

    const isMultiUse = invite.maxUses !== null;

    if (!isMultiUse && (invite.usedAt || invite.usedById)) {
      throw new ConflictException('Invite already used');
    }

    if (isMultiUse && invite.usesCount >= invite.maxUses!) {
      throw new GoneException('Invite max uses reached');
    }

    try {
      const member = isMultiUse
        ? await this.invites.acceptInviteLink(
            invite.id,
            userId,
            invite.workspaceId,
            invite.role,
            invite.maxUses,
          )
        : await this.invites.acceptInvite(
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
        (error.message === 'INVITE_ALREADY_USED_OR_REVOKED' ||
          error.message === 'INVITE_MAX_USES_REACHED')
      ) {
        const current = await this.invites.findById(invite.id);
        if (!current || current.deletedAt) {
          throw new NotFoundException('Invite not found');
        }
        if (current.maxUses !== null && current.usesCount >= current.maxUses) {
          throw new GoneException('Invite max uses reached');
        }
        if (current.usedAt || current.usedById) {
          throw new ConflictException('Invite already used');
        }
        throw new NotFoundException('Invite not found');
      }
      throw error;
    }
  }

  async preview(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await this.invites.findByTokenHashWithWorkspace(tokenHash);

    if (!invite || invite.deletedAt) {
      throw new NotFoundException('Invite not found');
    }

    const isValid =
      invite.expiresAt >= new Date() &&
      (invite.maxUses === null || invite.usesCount < invite.maxUses);

    return {
      workspaceName: invite.workspace?.name ?? null,
      expiresAt: invite.expiresAt,
      valid: isValid,
    };
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

    const isMultiUse = invite.maxUses !== null;
    if (!isMultiUse && (invite.usedAt || invite.usedById)) {
      throw new ConflictException('Invite already used');
    }

    const revokedAt = new Date();
    const deleteMethod = isMultiUse
      ? this.invites.softDeleteInviteLink.bind(this.invites)
      : this.invites.softDeleteIfUnused.bind(this.invites);
    const deletedCount = await deleteMethod(inviteId, revokedAt);

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
      return {
        workspaceId: invite.workspaceId,
        role: existingRole,
        joinedAt: null,
      };
    }

    const isMultiUse = invite.maxUses !== null;

    if (!isMultiUse && (invite.usedAt || invite.usedById)) {
      throw new ConflictException('Invite already used');
    }

    if (isMultiUse && invite.usesCount >= invite.maxUses!) {
      throw new GoneException('Invite max uses reached');
    }

    try {
      const member = isMultiUse
        ? await this.invites.acceptInviteLink(
            invite.id,
            userId,
            invite.workspaceId,
            invite.role,
            invite.maxUses,
          )
        : await this.invites.acceptInvite(
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
        (error.message === 'INVITE_ALREADY_USED_OR_REVOKED' ||
          error.message === 'INVITE_MAX_USES_REACHED')
      ) {
        const current = await this.invites.findById(invite.id);
        if (!current || current.deletedAt) {
          throw new NotFoundException('Invite not found');
        }
        if (current.maxUses !== null && current.usesCount >= current.maxUses) {
          throw new GoneException('Invite max uses reached');
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
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      createdAt: invite.createdAt,
    }));
  }

  private mapInviteStatus(invite: {
    deletedAt: Date | null;
    usedAt: Date | null;
    usedById: string | null;
    expiresAt: Date;
    maxUses: number | null;
    usesCount: number;
  }): 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED' {
    if (invite.deletedAt) return 'REVOKED';
    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses)
      return 'USED';
    if (invite.usedAt || invite.usedById) return 'USED';
    if (invite.expiresAt < new Date()) return 'EXPIRED';
    return 'PENDING';
  }
}
