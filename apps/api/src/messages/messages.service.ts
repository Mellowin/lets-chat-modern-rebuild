import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { MessagesRepository } from './messages.repository';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly channels: ChannelsRepository,
  ) {}

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

    if (channel.type === 'PRIVATE') {
      const chRole = await this.channels.findChannelMemberRole(
        channelId,
        userId,
      );
      if (!chRole) {
        throw new NotFoundException('Channel not found');
      }
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

    return this.messages.createMessage({
      channelId,
      authorId: userId,
      content: dto.content,
      parentId: dto.parentId,
    });
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
    return this.messages.listForChannel(channelId, limit, before);
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
    if (!message || message.channelId !== channelId || message.deletedAt !== null) {
      throw new NotFoundException('Message not found');
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }

    const editWindowMs = 15 * 60 * 1000;
    if (Date.now() - message.createdAt.getTime() > editWindowMs) {
      throw new ForbiddenException('Message edit window has expired');
    }

    return this.messages.updateMessage(messageId, message.content, dto.content, userId);
  }

  async remove(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ) {
    await this.validateChannelAccess(workspaceId, channelId, userId);

    const message = await this.messages.findById(messageId);
    if (!message || message.channelId !== channelId || message.deletedAt !== null) {
      throw new NotFoundException('Message not found');
    }

    if (message.authorId !== userId) {
      const chRole = await this.channels.findChannelMemberRole(channelId, userId);
      if (chRole !== 'OWNER' && chRole !== 'ADMIN') {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    await this.messages.softDeleteMessage(messageId);
  }
}
