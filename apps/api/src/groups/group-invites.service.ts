import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { GroupsRepository } from './groups.repository';
import { GroupInvitesRepository } from './group-invites.repository';
import { CreateGroupInviteDto } from './dto/create-group-invite.dto';
import { GroupsService } from './groups.service';

const DEFAULT_EXPIRES_IN_HOURS = 7 * 24;

@Injectable()
export class GroupInvitesService {
  constructor(
    private readonly groups: GroupsRepository,
    private readonly groupInvites: GroupInvitesRepository,
    private readonly groupsService: GroupsService,
    private readonly websocketEvents: WebsocketEventsService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isInviteValid(invite: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
  }): boolean {
    if (invite.revokedAt) return false;
    if (invite.expiresAt && invite.expiresAt < new Date()) return false;
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses)
      return false;
    return true;
  }

  private async requireOwner(groupId: string, userId: string) {
    const member = await this.groups.findActiveMember(groupId, userId);
    if (!member) {
      throw new NotFoundException('Group not found');
    }
    if (member.role !== 'OWNER') {
      throw new ForbiddenException('Only the group owner can do this');
    }
  }

  async createInvite(
    groupId: string,
    dto: CreateGroupInviteDto,
    currentUserId: string,
  ) {
    await this.requireOwner(groupId, currentUserId);

    const group = await this.groups.findById(groupId);
    if (!group || group.archivedAt) {
      throw new NotFoundException('Group not found');
    }

    const expiresInHours = dto.expiresInHours ?? DEFAULT_EXPIRES_IN_HOURS;
    if (expiresInHours <= 0) {
      throw new BadRequestException('expiresInHours must be positive');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const maxUses = dto.maxUses ?? null;

    const invite = await this.groupInvites.createInvite({
      groupId,
      createdById: currentUserId,
      tokenHash,
      expiresAt,
      maxUses,
      roleOnJoin: 'MEMBER',
    });

    return {
      id: invite.id,
      groupId: invite.groupId,
      token: rawToken,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      createdAt: invite.createdAt,
    };
  }

  async listInvites(groupId: string, currentUserId: string) {
    await this.requireOwner(groupId, currentUserId);
    const invites = await this.groupInvites.listForGroup(groupId);
    return invites.map((invite) => ({
      id: invite.id,
      groupId: invite.groupId,
      expiresAt: invite.expiresAt,
      revokedAt: invite.revokedAt,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      createdAt: invite.createdAt,
      valid: this.isInviteValid(invite),
    }));
  }

  async revokeInvite(groupId: string, inviteId: string, currentUserId: string) {
    await this.requireOwner(groupId, currentUserId);

    const invite = await this.groupInvites.findById(inviteId);
    if (!invite || invite.groupId !== groupId) {
      throw new NotFoundException('Invite not found');
    }

    const revokedCount = await this.groupInvites.revokeInvite(inviteId);
    if (revokedCount === 0) {
      throw new NotFoundException('Invite not found');
    }

    return { id: inviteId, revokedAt: new Date() };
  }

  async preview(token: string) {
    const tokenHash = this.hashToken(token);
    const invite = await this.groupInvites.findByTokenHash(tokenHash);

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    return {
      groupName: invite.group?.name ?? null,
      expiresAt: invite.expiresAt,
      valid: this.isInviteValid(invite) && !invite.group?.archivedAt,
    };
  }

  async accept(token: string, currentUserId: string) {
    const tokenHash = this.hashToken(token);
    const invite = await this.groupInvites.findByTokenHash(tokenHash);

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (!this.isInviteValid(invite)) {
      throw new GoneException('Invite expired or revoked');
    }

    const group = await this.groups.findById(invite.groupId);
    if (!group || group.archivedAt) {
      throw new NotFoundException('Group not found');
    }

    const existingMember = await this.groups.findActiveMember(
      invite.groupId,
      currentUserId,
    );

    if (!existingMember) {
      await this.groups.addMember(invite.groupId, currentUserId);
      await this.groupInvites.incrementUseCount(invite.id);
    }

    const response = await this.groupsService.get(
      invite.groupId,
      currentUserId,
    );

    this.websocketEvents.broadcastGroupConversationUpdated(
      invite.groupId,
      response,
      response.members.map((m) => m.id),
    );

    return response;
  }
}
