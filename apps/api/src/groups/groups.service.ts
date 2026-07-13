import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from '../common/cursor-pagination';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PushService } from '../push/push.service';
import { BlocksService } from '../safety/blocks.service';
import { MentionsService } from '../common/mentions.service';
import { mapAttachmentResponse } from '../messages/messages.service';
import {
  validateAttachmentFile,
  assertAttachmentAllowed,
} from '../messages/attachment-validation';
import {
  decodeMultipartFilename,
  sanitizeStorageFilename,
} from '../messages/attachments.service';
import { StorageService } from '../storage/storage.service';
import { AttachmentsRepository } from '../messages/attachments.repository';
import { StorageBackend } from '@lets-chat/database';
import { randomUUID } from 'crypto';
import { GroupsRepository } from './groups.repository';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupMessageDto } from './dto/create-group-message.dto';
import { ListGroupMessagesQueryDto } from './dto/list-group-messages-query.dto';
import { GroupMessageContextQueryDto } from './dto/message-context-query.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groups: GroupsRepository,
    private readonly users: UsersRepository,
    private readonly websocketEvents: WebsocketEventsService,
    private readonly pushService: PushService,
    private readonly blocks: BlocksService,
    private readonly mentions: MentionsService,
    private readonly storage: StorageService,
    private readonly attachments: AttachmentsRepository,
    @Optional()
    @Inject(AuditService)
    private readonly audit: AuditService | null = null,
  ) {}

  private normalizeMentions(
    value: unknown,
  ): Array<{ userId: string; username: string }> | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter(
      (item): item is { userId: string; username: string } =>
        typeof item === 'object' &&
        item !== null &&
        'userId' in item &&
        'username' in item &&
        typeof (item as { userId: unknown }).userId === 'string' &&
        typeof (item as { username: unknown }).username === 'string',
    );
  }

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

    await this.audit?.record({
      actorId: currentUserId,
      action: AuditAction.GROUP_CREATED,
      entityType: AuditEntityType.GROUP,
      entityId: created.id,
      groupId: created.id,
      severity: AuditSeverity.INFO,
      metadata: {
        name: created.name,
        memberCount: uniqueMemberIds.length,
      },
    });

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

    await this.audit?.record({
      actorId: currentUserId,
      action: AuditAction.GROUP_ARCHIVED,
      entityType: AuditEntityType.GROUP,
      entityId: groupId,
      groupId,
      severity: AuditSeverity.WARNING,
    });

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

    await this.blocks.requireNoBlockInEitherDirection(
      currentUserId,
      dto.userId,
      'Cannot add this user to the group',
    );

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

    await this.audit?.record({
      actorId: currentUserId,
      targetUserId: dto.userId,
      action: AuditAction.GROUP_MEMBER_ADDED,
      entityType: AuditEntityType.GROUP_MEMBER,
      entityId: groupId,
      groupId,
      severity: AuditSeverity.INFO,
    });

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

    await this.audit?.record({
      actorId: currentUserId,
      targetUserId: userId,
      action: AuditAction.GROUP_MEMBER_REMOVED,
      entityType: AuditEntityType.GROUP_MEMBER,
      entityId: groupId,
      groupId,
      severity: AuditSeverity.WARNING,
      metadata: { role: targetMember.role },
    });

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

    await this.audit?.record({
      actorId: currentUserId,
      targetUserId: currentUserId,
      action: AuditAction.GROUP_MEMBER_LEFT,
      entityType: AuditEntityType.GROUP_MEMBER,
      entityId: groupId,
      groupId,
      severity: AuditSeverity.INFO,
      metadata: { role: member.role },
    });

    return { success: true };
  }

  async getMessageContext(
    groupId: string,
    messageId: string,
    currentUserId: string,
    query: GroupMessageContextQueryDto,
  ) {
    await this.requireGroupAccessible(groupId, currentUserId);

    const target = await this.groups.findMessageByIdWithRelations(messageId);
    if (!target || target.groupId !== groupId) {
      throw new NotFoundException('Message not found');
    }

    const beforeLimit = Math.min(query.before ?? 20, 50);
    const afterLimit = Math.min(query.after ?? 20, 50);

    const [beforeRaw, afterRaw] = await Promise.all([
      this.groups.findContextBefore(groupId, target.createdAt, beforeLimit),
      this.groups.findContextAfter(groupId, target.createdAt, afterLimit),
    ]);

    const hasMoreBefore = beforeRaw.length > beforeLimit;
    const hasMoreAfter = afterRaw.length > afterLimit;

    const before = (hasMoreBefore ? beforeRaw.slice(0, beforeLimit) : beforeRaw)
      .reverse()
      .map((m) => ({
        id: m.id,
        groupId: m.groupId,
        content: m.content,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        author: m.author,
        attachments: (m.attachments ?? []).map(mapAttachmentResponse),
        mentions: this.normalizeMentions(m.mentions),
        replyToMessageId: m.replyToMessageId ?? null,
        replyTo: m.replyToMessage
          ? {
              id: m.replyToMessage.id,
              content: m.replyToMessage.content,
              author: m.replyToMessage.author,
            }
          : null,
      }));

    const after = (hasMoreAfter ? afterRaw.slice(0, afterLimit) : afterRaw).map(
      (m) => ({
        id: m.id,
        groupId: m.groupId,
        content: m.content,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        author: m.author,
        attachments: (m.attachments ?? []).map(mapAttachmentResponse),
        mentions: this.normalizeMentions(m.mentions),
        replyToMessageId: m.replyToMessageId ?? null,
        replyTo: m.replyToMessage
          ? {
              id: m.replyToMessage.id,
              content: m.replyToMessage.content,
              author: m.replyToMessage.author,
            }
          : null,
      }),
    );

    return {
      target: {
        id: target.id,
        groupId: target.groupId,
        content: target.content,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
        author: target.author,
        attachments: (target.attachments ?? []).map(mapAttachmentResponse),
        mentions: this.normalizeMentions(target.mentions),
        replyToMessageId: target.replyToMessageId ?? null,
        replyTo: target.replyToMessage
          ? {
              id: target.replyToMessage.id,
              content: target.replyToMessage.content,
              author: target.replyToMessage.author,
            }
          : null,
      },
      before,
      after,
      hasMoreBefore,
      hasMoreAfter,
    };
  }

  async listMessages(
    groupId: string,
    currentUserId: string,
    query?: ListGroupMessagesQueryDto,
  ) {
    await this.requireGroupAccessible(groupId, currentUserId);

    const limit = Math.min(query?.limit ?? 50, 100);
    const cursor = query?.cursor
      ? decodeMessageCursor(query.cursor)
      : undefined;
    if (query?.cursor && !cursor) {
      throw new BadRequestException('Invalid cursor format');
    }

    const rows = await this.groups.listMessages(groupId, limit, cursor);
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();

    const items = page.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      content: m.content,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      author: m.author,
      attachments: (m.attachments ?? []).map(mapAttachmentResponse),
      mentions: this.normalizeMentions(m.mentions),
      replyToMessageId: m.replyToMessageId ?? null,
      replyTo: m.replyToMessage
        ? {
            id: m.replyToMessage.id,
            content: m.replyToMessage.content,
            author: m.replyToMessage.author,
          }
        : null,
    }));

    return {
      items,
      nextCursor:
        hasMore && page.length > 0 ? encodeMessageCursor(page[0]) : null,
      hasMore,
    };
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

    if (dto.replyToMessageId) {
      const replyTarget = await this.groups.findMessageByIdWithRelations(
        dto.replyToMessageId,
      );
      if (!replyTarget || replyTarget.groupId !== groupId) {
        throw new BadRequestException('Reply target message not found');
      }
    }

    const content = dto.content?.trim() ?? '';

    const mentionableUserIds = new Set(
      await this.groups.findMentionableUserIds(groupId),
    );
    const mentions = await this.mentions.resolveMentions(
      content,
      mentionableUserIds,
    );

    const attachmentIds = dto.attachmentIds?.length
      ? Array.from(new Set(dto.attachmentIds))
      : [];
    if (attachmentIds.length > 0) {
      const attachments = await this.groups.findUnattachedAttachmentsByIds(
        attachmentIds,
        currentUserId,
      );
      if (attachments.length !== attachmentIds.length) {
        throw new BadRequestException(
          'One or more attachments are invalid or already in use',
        );
      }
    }

    const hasContent = content.length > 0;
    const hasAttachments = attachmentIds.length > 0;
    if (!hasContent && !hasAttachments) {
      throw new BadRequestException(
        'Message content or attachment is required',
      );
    }

    const message = await this.groups.createMessage({
      groupId,
      authorId: currentUserId,
      content,
      mentions,
      replyToMessageId: dto.replyToMessageId ?? null,
      ...(attachmentIds.length > 0 && { attachmentIds }),
    });

    await this.groups.touchUpdatedAt(groupId);

    const response = {
      id: message.id,
      groupId: message.groupId,
      content: message.content,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      author: message.author,
      attachments: (message.attachments ?? []).map(mapAttachmentResponse),
      mentions: this.normalizeMentions(message.mentions),
      replyToMessageId: message.replyToMessageId ?? null,
      replyTo: message.replyToMessage
        ? {
            id: message.replyToMessage.id,
            content: message.replyToMessage.content,
            author: message.replyToMessage.author,
          }
        : null,
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

    if (mentions.length > 0) {
      this.pushService
        .notifyGroupMention(groupId, {
          id: message.id,
          content: message.content,
          authorId: message.authorId,
          mentions,
        })
        .catch(() => {
          // Mention notifications are best-effort.
        });
    }

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

  async uploadAttachment(
    groupId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    await this.requireActiveMembership(groupId, userId);

    const normalizedMimeType = assertAttachmentAllowed(
      await validateAttachmentFile(file),
    );

    const decodedOriginalName = decodeMultipartFilename(file.originalname);
    const sanitized = sanitizeStorageFilename(decodedOriginalName);
    const storageKey = `attachments/${userId}/${randomUUID()}-${sanitized}`;

    await this.storage.putObject(storageKey, file.buffer, normalizedMimeType);

    const attachment = await this.attachments.createUnattachedAttachment({
      createdById: userId,
      filename: decodedOriginalName,
      originalName: decodedOriginalName,
      mimeType: normalizedMimeType,
      size: file.size,
      storageKey,
      storageBackend: StorageBackend.MINIO,
    });

    return mapAttachmentResponse(attachment);
  }

  async downloadAttachmentFile(
    groupId: string,
    messageId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.requireActiveMembership(groupId, userId);

    const message = await this.groups.findMessageByIdWithRelations(messageId);
    if (!message || message.groupId !== groupId) {
      throw new NotFoundException('Message not found');
    }

    const attachment = await this.attachments.findById(attachmentId);
    if (
      !attachment ||
      attachment.groupMessageId !== messageId ||
      attachment.deletedAt !== null
    ) {
      throw new NotFoundException('Attachment not found');
    }

    const object = await this.storage.getObject(attachment.storageKey);
    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
    };
  }
}
