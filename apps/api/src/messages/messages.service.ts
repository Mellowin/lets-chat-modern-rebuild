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
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

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
    };
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

    const message = await this.messages.createMessage({
      channelId,
      authorId: userId,
      content: dto.content,
      parentId: dto.parentId,
    });

    const response = this.toMessageResponse(message, userId);
    this.websocketEvents.broadcastMessageCreated(channelId, response);

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
    const before = query.before ? new Date(query.before) : undefined;
    const messages = await this.messages.listForChannel(
      channelId,
      limit,
      before,
    );
    return messages.map((m) => this.toMessageResponse(m, userId));
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
