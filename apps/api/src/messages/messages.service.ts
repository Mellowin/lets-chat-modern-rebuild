import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { MessagesRepository } from './messages.repository';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly channels: ChannelsRepository,
  ) {}

  async create(
    workspaceId: string,
    channelId: string,
    dto: CreateMessageDto,
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

    const limit = Math.min(query.limit ?? 50, 100);
    const before = query.before ? new Date(query.before) : undefined;
    return this.messages.listForChannel(channelId, limit, before);
  }
}
