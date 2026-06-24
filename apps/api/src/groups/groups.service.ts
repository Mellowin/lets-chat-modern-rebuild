import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PushService } from '../push/push.service';
import { GroupsRepository } from './groups.repository';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupMessageDto } from './dto/create-group-message.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groups: GroupsRepository,
    private readonly users: UsersRepository,
    private readonly websocketEvents: WebsocketEventsService,
    private readonly pushService: PushService,
  ) {}

  private async toGroupResponse(
    group: Awaited<ReturnType<GroupsRepository['findById']>>,
    currentUserId: string,
  ) {
    if (!group) return null;

    const myMember = group.members.find((m) => m.user.id === currentUserId);
    const unreadCount = await this.groups.countUnreadMessages(
      group.id,
      currentUserId,
      myMember?.lastReadAt ?? null,
    );

    return {
      id: group.id,
      name: group.name,
      createdById: group.createdById,
      archivedAt: group.archivedAt,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      memberCount: group.members.length,
      members: group.members.map((m) => ({
        id: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      myRole: myMember?.role ?? null,
      lastMessage: group.messages[0]
        ? {
            id: group.messages[0].id,
            content: group.messages[0].content,
            createdAt: group.messages[0].createdAt,
            authorId: group.messages[0].authorId,
          }
        : null,
      unreadCount,
      hasUnread: unreadCount > 0,
    };
  }

  private async requireActiveMembership(groupId: string, userId: string) {
    const member = await this.groups.findActiveMember(groupId, userId);
    if (!member) {
      throw new NotFoundException('Group not found');
    }
    return member;
  }

  private async requireOwner(groupId: string, userId: string) {
    const member = await this.requireActiveMembership(groupId, userId);
    if (member.role !== 'OWNER') {
      throw new ForbiddenException('Only the group owner can do this');
    }
    return member;
  }

  private async requireGroupAccessible(groupId: string, userId: string) {
    const group = await this.groups.findById(groupId);
    if (!group || group.archivedAt) {
      throw new NotFoundException('Group not found');
    }
    const isMember = group.members.some((m) => m.user.id === userId);
    if (!isMember) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async create(dto: CreateGroupDto, currentUserId: string) {
    const uniqueMemberIds = Array.from(new Set(dto.memberIds));

    if (uniqueMemberIds.includes(currentUserId)) {
      throw new BadRequestException(
        'Creator should not be listed in memberIds',
      );
    }

    if (uniqueMemberIds.length === 0) {
      throw new BadRequestException(
        'Group must have at least one other member',
      );
    }

    for (const userId of uniqueMemberIds) {
      const user = await this.users.findById(userId);
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }
    }

    const created = await this.groups.create({
      name: dto.name.trim(),
      createdById: currentUserId,
      memberIds: uniqueMemberIds,
    });

    const response = await this.toGroupResponse(created, currentUserId);
    if (!response) {
      throw new NotFoundException('Group not found');
    }

    this.websocketEvents.broadcastGroupConversationUpdated(
      created.id,
      response,
      [currentUserId, ...uniqueMemberIds],
    );

    return response;
  }

  async list(currentUserId: string) {
    const groups = await this.groups.listForUser(currentUserId);
    return Promise.all(
      groups.map((g) => this.toGroupResponse(g, currentUserId)),
    );
  }

  async get(groupId: string, currentUserId: string) {
    const group = await this.requireGroupAccessible(groupId, currentUserId);
    const response = await this.toGroupResponse(group, currentUserId);
    if (!response) {
      throw new NotFoundException('Group not found');
    }
    return response;
  }

  async update(groupId: string, dto: UpdateGroupDto, currentUserId: string) {
    await this.requireOwner(groupId, currentUserId);
    const updated = await this.groups.updateName(groupId, dto.name.trim());
    const response = await this.toGroupResponse(updated, currentUserId);
    if (!response) {
      throw new NotFoundException('Group not found');
    }
    this.websocketEvents.broadcastGroupConversationUpdated(
      groupId,
      response,
      updated.members.map((m) => m.user.id),
    );
    return response;
  }

  async archive(groupId: string, currentUserId: string) {
    await this.requireOwner(groupId, currentUserId);
    const group = await this.groups.findById(groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    await this.groups.archive(groupId);
    const memberIds = group.members.map((m) => m.user.id);
    this.websocketEvents.broadcastGroupConversationUpdated(
      groupId,
      { groupId, archivedAt: new Date() },
      memberIds,
    );
    return { success: true };
  }

  async addMember(
    groupId: string,
    dto: AddGroupMemberDto,
    currentUserId: string,
  ) {
    await this.requireOwner(groupId, currentUserId);
    const group = await this.groups.findById(groupId);
    if (!group || group.archivedAt) {
      throw new NotFoundException('Group not found');
    }

    const targetUser = await this.users.findById(dto.userId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    await this.groups.addMember(groupId, dto.userId);
    const updated = await this.groups.findById(groupId);
    const response = await this.toGroupResponse(updated, currentUserId);
    if (!response) {
      throw new NotFoundException('Group not found');
    }
    this.websocketEvents.broadcastGroupConversationUpdated(
      groupId,
      response,
      updated?.members.map((m) => m.user.id) ?? [],
    );
    return response;
  }

  async removeMember(groupId: string, userId: string, currentUserId: string) {
    await this.requireOwner(groupId, currentUserId);

    if (userId === currentUserId) {
      throw new BadRequestException('Owner cannot remove themselves');
    }

    const group = await this.groups.findById(groupId);
    if (!group || group.archivedAt) {
      throw new NotFoundException('Group not found');
    }

    const targetMember = await this.groups.findActiveMember(groupId, userId);
    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    await this.groups.removeMember(groupId, userId);
    const updated = await this.groups.findById(groupId);
    const response = await this.toGroupResponse(updated, currentUserId);
    if (!response) {
      throw new NotFoundException('Group not found');
    }
    this.websocketEvents.broadcastGroupConversationUpdated(
      groupId,
      response,
      updated?.members.map((m) => m.user.id) ?? [],
    );
    this.websocketEvents.broadcastGroupMemberRemoved(groupId, { userId });
    return response;
  }

  async leave(groupId: string, currentUserId: string) {
    const member = await this.requireActiveMembership(groupId, currentUserId);

    if (member.role === 'OWNER') {
      const ownerCount = await this.groups.countOwners(groupId);
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Owner must transfer ownership or archive the group before leaving',
        );
      }
    }

    await this.groups.leave(groupId, currentUserId);
    this.websocketEvents.broadcastGroupMemberRemoved(groupId, {
      userId: currentUserId,
    });
    return { success: true };
  }

  async listMessages(groupId: string, currentUserId: string) {
    await this.requireGroupAccessible(groupId, currentUserId);
    const messages = await this.groups.listMessages(groupId);
    return messages.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      content: m.content,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      author: m.author,
    }));
  }

  async createMessage(
    groupId: string,
    dto: CreateGroupMessageDto,
    currentUserId: string,
  ) {
    const group = await this.requireGroupAccessible(groupId, currentUserId);

    if (dto.parentId) {
      throw new BadRequestException('Replies are not supported in groups');
    }

    const message = await this.groups.createMessage({
      groupId,
      authorId: currentUserId,
      content: dto.content,
    });

    await this.groups.touchUpdatedAt(groupId);

    const response = {
      id: message.id,
      groupId: message.groupId,
      content: message.content,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      author: message.author,
    };

    this.websocketEvents.broadcastGroupMessageCreated(groupId, response);

    const conversationResponse = await this.toGroupResponse(
      await this.groups.findById(groupId),
      currentUserId,
    );
    if (conversationResponse) {
      this.websocketEvents.broadcastGroupConversationUpdated(
        groupId,
        conversationResponse,
        group.members.map((m) => m.user.id),
      );
    }

    this.pushService
      .notifyGroupMessage(groupId, {
        id: message.id,
        content: message.content,
        authorId: message.authorId,
      })
      .catch(() => {
        // Push notifications are best-effort and must not break messaging.
      });

    return response;
  }

  async markAsRead(groupId: string, currentUserId: string) {
    await this.requireActiveMembership(groupId, currentUserId);
    await this.groups.updateLastRead(groupId, currentUserId);
    this.websocketEvents.broadcastGroupConversationRead(groupId, {
      groupId,
      userId: currentUserId,
      readAt: new Date().toISOString(),
    });
    return { success: true, lastReadAt: new Date().toISOString() };
  }
}
