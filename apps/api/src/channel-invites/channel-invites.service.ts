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
import { ChannelInvitesRepository } from './channel-invites.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { CreateChannelInviteDto } from './dto/create-channel-invite.dto';

@Injectable()
export class ChannelInvitesService {
  constructor(
    private readonly channelInvites: ChannelInvitesRepository,
    private readonly channels: ChannelsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
  ) {}

  async create(
    workspaceId: string,
    channelId: string,
    dto: CreateChannelInviteDto,
    invitedById: string,
  ) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const wsRole = await this.workspaces.findMemberRole(
      workspaceId,
      invitedById,
    );
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(
      channelId,
      invitedById,
    );
    if (!chRole) {
      throw new NotFoundException('Channel not found');
    }

    if (chRole !== 'OWNER' && chRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    if ((dto.role as string) === 'OWNER') {
      throw new BadRequestException('Cannot create OWNER invite');
    }

    if (chRole === 'ADMIN' && dto.role === 'ADMIN') {
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

    if (targetUserId) {
      const wsMember = await this.workspaces.findActiveMemberByUserId(
        workspaceId,
        targetUserId,
      );
      if (!wsMember) {
        throw new ConflictException('User must be a workspace member first');
      }

      const existingChannelMember =
        await this.channels.findActiveChannelMemberByUserId(
          channelId,
          targetUserId,
        );
      if (existingChannelMember) {
        throw new ConflictException('Already a member of this channel');
      }
    } else {
      throw new ConflictException('User must be a workspace member first');
    }

    const existingPending =
      await this.channelInvites.findPendingByChannelAndEmail(
        channelId,
        resolvedEmail,
      );
    if (existingPending) {
      throw new ConflictException('Invitation already sent');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.channelInvites.createInvite({
      workspaceId,
      channelId,
      invitedById,
      invitedEmail: resolvedEmail,
      role: dto.role,
      tokenHash,
      expiresAt,
    });

    await this.audit.record({
      actorId: invitedById,
      action: AuditAction.CHANNEL_INVITE_CREATED,
      entityType: AuditEntityType.CHANNEL_INVITATION,
      entityId: invite.id,
      workspaceId,
      channelId,
      metadata: { role: invite.role, expiresAt: invite.expiresAt },
    });

    return {
      id: invite.id,
      workspaceId: invite.workspaceId,
      channelId: invite.channelId,
      email: invite.invitedEmail,
      role: invite.role,
      token: rawToken,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async acceptById(inviteId: string, userId: string, userEmail: string) {
    const invite = await this.channelInvites.findPendingById(inviteId);
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

    const wsRole = await this.workspaces.findMemberRole(
      invite.workspaceId,
      userId,
    );
    if (!wsRole) {
      throw new ConflictException('User must be a workspace member first');
    }

    const channel = await this.channels.findActiveById(invite.channelId);
    if (!channel || channel.workspaceId !== invite.workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const existingChannelRole = await this.channels.findChannelMemberRole(
      invite.channelId,
      userId,
    );
    if (existingChannelRole) {
      throw new ConflictException('Already a member of this channel');
    }

    try {
      const member = await this.channelInvites.acceptInvite(
        invite.id,
        userId,
        invite.channelId,
        invite.role,
      );

      await this.audit.record({
        actorId: userId,
        action: AuditAction.CHANNEL_INVITE_ACCEPTED,
        entityType: AuditEntityType.CHANNEL_INVITATION,
        entityId: invite.id,
        workspaceId: invite.workspaceId,
        channelId: invite.channelId,
        metadata: { role: invite.role },
      });

      return {
        workspaceId: invite.workspaceId,
        channelId: invite.channelId,
        role: member.role,
        joinedAt: member.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Already a member of this channel');
      }
      if (
        error instanceof Error &&
        error.message === 'INVITE_ALREADY_USED_OR_REVOKED'
      ) {
        const current = await this.channelInvites.findById(invite.id);
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
    const invite = await this.channelInvites.findPendingById(inviteId);
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
    const deletedCount = await this.channelInvites.softDeleteIfUnused(
      inviteId,
      declinedAt,
    );
    if (deletedCount === 0) {
      const current = await this.channelInvites.findById(inviteId);
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
      action: AuditAction.CHANNEL_INVITE_DECLINED,
      entityType: AuditEntityType.CHANNEL_INVITATION,
      entityId: inviteId,
      workspaceId: invite.workspaceId,
      channelId: invite.channelId,
      metadata: { role: invite.role },
    });

    return { id: inviteId, deletedAt: declinedAt };
  }

  async listPending(userId: string, userEmail: string) {
    const invites = await this.channelInvites.findPendingByEmail(userEmail);
    return invites.map((invite) => ({
      id: invite.id,
      workspace: invite.workspace,
      channel: invite.channel,
      invitedBy: invite.invitedBy,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }));
  }

  async listForChannel(workspaceId: string, channelId: string, userId: string) {
    const workspace = await this.workspaces.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
    if (!wsRole) {
      throw new NotFoundException('Workspace not found');
    }

    const channel = await this.channels.findActiveById(channelId);
    if (!channel || channel.workspaceId !== workspaceId) {
      throw new NotFoundException('Channel not found');
    }

    const chRole = await this.channels.findChannelMemberRole(channelId, userId);
    if (!chRole) {
      throw new NotFoundException('Channel not found');
    }

    if (chRole !== 'OWNER' && chRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    const invites = await this.channelInvites.listForChannel(channelId);
    return invites.map((invite) => ({
      id: invite.id,
      workspaceId: invite.workspaceId,
      channelId: invite.channelId,
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
