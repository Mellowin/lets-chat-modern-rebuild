import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { MessagesRepository } from './messages.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PushService } from '../push/push.service';
import { MentionsService } from '../common/mentions.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SearchChannelMessagesQueryDto } from './dto/search-channel-messages-query.dto';
import { MessageContextQueryDto } from './dto/message-context-query.dto';
import {
  validateAttachmentBatch,
  assertAttachmentBatchAllowed,
} from './attachment-validation';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from '../common/cursor-pagination';

export type AttachmentKind = 'image' | 'file';

export function classifyAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  return 'file';
}

export function mapAttachmentResponse(attachment: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    fileName: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.size,
    kind: classifyAttachmentKind(attachment.mimeType),
    createdAt: attachment.createdAt,
  };
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly channels: ChannelsRepository,
    private readonly websocketEvents: WebsocketEventsService,
    private readonly pushService: PushService,
    private readonly mentions: MentionsService,
  ) {}

  private toMessageResponse(
    message: {
      id: string;
      channelId: string;
      content: string;
      parentId: string | null;
      createdAt: Date;
      updatedAt: Date;
      editedAt: Date | null;
      author: {
        id: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
      };
      reactions: Array<{ emoji: string; userId: string }>;
      attachments: Array<{
        id: string;
        filename: string;
        mimeType: string;
        size: number;
        createdAt: Date;
      }>;
      mentions?: unknown;
    },
    userId: string,
  ) {
    const emojiCounts = new Map<string, number>();
    const myEmojis = new Set<string>();
    for (const r of message.reactions ?? []) {
      emojiCounts.set(r.emoji, (emojiCounts.get(r.emoji) ?? 0) + 1);
      if (r.userId === userId) {
        myEmojis.add(r.emoji);
      }
    }
    const reactions = Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({
        emoji,
        count,
        reactedByMe: myEmojis.has(emoji),
      }))
      .sort((a, b) => a.emoji.localeCompare(b.emoji));

    const attachments = (message.attachments ?? []).map(mapAttachmentResponse);

    return {
      id: message.id,
      channelId: message.channelId,
      content: message.content,
      parentId: message.parentId,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      author: message.author,
      reactions,
      attachments,
      mentions: this.normalizeMentions(message.mentions),
    };
  }

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

  private async validateChannelAccess(
    workspaceId: string,
    channelId: string,
    userId: string,
  ) {
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
  }

  async create(
    workspaceId: string,
    channelId: string,
    dto: CreateMessageDto,
    userId: string,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    if (dto.parentId) {
      const parent = await this.messages.findById(dto.parentId);
      if (
        !parent ||
        parent.channelId !== channelId ||
        parent.deletedAt !== null
      ) {
        throw new BadRequestException('Parent message not found');
      }
      if (parent.parentId !== null) {
        throw new BadRequestException('Cannot reply to a reply');
      }
    }

    const hasContent = dto.content && dto.content.trim().length > 0;
    const hasAttachments = dto.attachments && dto.attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      throw new BadRequestException('Message must have content or attachments');
    }

    if (dto.attachments) {
      for (const att of dto.attachments) {
        const expectedKind = classifyAttachmentKind(att.mimeType);
        if (att.kind !== expectedKind) {
          throw new BadRequestException(
            `Attachment kind mismatch for ${att.fileName}: expected ${expectedKind}, received ${att.kind}`,
          );
        }
      }

      const batchResult = validateAttachmentBatch(
        dto.attachments.map((a) => ({
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      );
      assertAttachmentBatchAllowed(batchResult);
    }

    const mentionableUserIds = new Set(
      await this.channels.findMentionableUserIds(channelId),
    );
    const mentions = await this.mentions.resolveMentions(
      dto.content ?? '',
      mentionableUserIds,
    );

    const message = await this.messages.createMessage({
      channelId,
      authorId: userId,
      content: dto.content ?? '',
      parentId: dto.parentId,
      attachments: dto.attachments?.map((a) => ({
        storageKey: a.storageKey,
        filename: a.fileName,
        mimeType: a.mimeType,
        size: a.sizeBytes,
        createdById: userId,
      })),
      mentions,
    });

    const response = this.toMessageResponse(message, userId);
    this.websocketEvents.broadcastMessageCreated(channelId, response);

    this.pushService
      .notifyChannelMessage(channelId, {
        id: message.id,
        content: message.content,
        authorId: message.authorId,
      })
      .catch(() => {
        // Push notifications are best-effort and must not break messaging.
      });

    if (mentions.length > 0) {
      this.pushService
        .notifyChannelMention(channelId, {
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

  async list(
    workspaceId: string,
    channelId: string,
    userId: string,
    query: ListMessagesQueryDto,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    const limit = Math.min(query.limit ?? 50, 100);
    const cursor = query.cursor ? decodeMessageCursor(query.cursor) : undefined;
    if (query.cursor && !cursor) {
      throw new BadRequestException('Invalid cursor format');
    }

    const rows = await this.messages.listForChannel(channelId, limit, cursor);
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    const items = page.map((m) => this.toMessageResponse(m, userId));

    return {
      items,
      nextCursor:
        hasMore && page.length > 0 ? encodeMessageCursor(page[0]) : null,
      hasMore,
    };
  }

  async searchChannelMessages(
    workspaceId: string,
    channelId: string,
    userId: string,
    query: SearchChannelMessagesQueryDto,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    const q = query.q.trim();
    if (q.length === 0) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const limit = Math.min(query.limit ?? 20, 50);
    const rows = await this.messages.searchChannelMessages(
      channelId,
      q,
      limit,
      query.cursor,
    );

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((m) =>
      this.toMessageResponse(m, userId),
    );

    return {
      items,
      nextCursor: hasMore ? (rows[limit - 1]?.id ?? null) : null,
    };
  }

  async getContext(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
    query: MessageContextQueryDto,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    const target = await this.messages.findByIdWithRelations(messageId);
    if (!target || target.channelId !== channelId) {
      throw new NotFoundException('Message not found');
    }

    const beforeLimit = Math.min(query.before ?? 20, 50);
    const afterLimit = Math.min(query.after ?? 20, 50);

    const [beforeRaw, afterRaw] = await Promise.all([
      this.messages.findContextBefore(channelId, target.createdAt, beforeLimit),
      this.messages.findContextAfter(channelId, target.createdAt, afterLimit),
    ]);

    const hasMoreBefore = beforeRaw.length > beforeLimit;
    const hasMoreAfter = afterRaw.length > afterLimit;

    const before = (hasMoreBefore ? beforeRaw.slice(0, beforeLimit) : beforeRaw)
      .reverse()
      .map((m) => this.toMessageResponse(m, userId));

    const after = (hasMoreAfter ? afterRaw.slice(0, afterLimit) : afterRaw).map(
      (m) => this.toMessageResponse(m, userId),
    );

    return {
      target: this.toMessageResponse(target, userId),
      before,
      after,
      hasMoreBefore,
      hasMoreAfter,
    };
  }

  async update(
    workspaceId: string,
    channelId: string,
    messageId: string,
    dto: UpdateMessageDto,
    userId: string,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    const message = await this.messages.findById(messageId);
    if (
      !message ||
      message.channelId !== channelId ||
      message.deletedAt !== null
    ) {
      throw new NotFoundException('Message not found');
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }

    const editWindowMs = 15 * 60 * 1000;
    if (Date.now() - message.createdAt.getTime() > editWindowMs) {
      throw new UnprocessableEntityException('Message edit window has expired');
    }

    const updated = await this.messages.updateMessage(
      messageId,
      message.content,
      dto.content,
      userId,
    );
    const response = this.toMessageResponse(updated, userId);
    this.websocketEvents.broadcastMessageUpdated(channelId, response);
    return response;
  }

  async remove(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    const message = await this.messages.findById(messageId);
    if (
      !message ||
      message.channelId !== channelId ||
      message.deletedAt !== null
    ) {
      throw new NotFoundException('Message not found');
    }

    if (message.authorId !== userId) {
      const chRole = await this.channels.findChannelMemberRole(
        channelId,
        userId,
      );
      if (chRole !== 'OWNER' && chRole !== 'ADMIN') {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    const deleted = await this.messages.softDeleteMessage(messageId);
    this.websocketEvents.broadcastMessageDeleted(channelId, {
      id: deleted.id,
      channelId: deleted.channelId,
      deletedAt: deleted.deletedAt!,
    });
  }
}
