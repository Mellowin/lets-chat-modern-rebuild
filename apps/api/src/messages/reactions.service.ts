import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { ReactionsRepository } from './reactions.repository';
import { CreateReactionDto } from './dto/create-reaction.dto';

@Injectable()
export class ReactionsService {
  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesRepository,
    private readonly reactions: ReactionsRepository,
  ) {}

  async addReaction(
    workspaceId: string,
    channelId: string,
    messageId: string,
    dto: CreateReactionDto,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    const active = await this.reactions.findActive(
      messageId,
      userId,
      dto.emoji,
    );
    if (active) {
      throw new ConflictException('Reaction already exists');
    }

    const deleted = await this.reactions.findDeleted(
      messageId,
      userId,
      dto.emoji,
    );
    if (deleted) {
      return this.reactions.restore(deleted.id);
    }

    return this.reactions.create({
      messageId,
      userId,
      emoji: dto.emoji,
    });
  }

  async removeReaction(
    workspaceId: string,
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    const active = await this.reactions.findActive(messageId, userId, emoji);
    if (!active) {
      throw new NotFoundException('Reaction not found');
    }

    await this.reactions.softDelete(active.id);
  }

  async listReactions(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    return this.reactions.listWithCounts(messageId, userId);
  }

  private async validateMessage(channelId: string, messageId: string) {
    const message = await this.messages.findById(messageId);
    if (!message || message.channelId !== channelId || message.deletedAt !== null) {
      throw new NotFoundException('Message not found');
    }
  }
}
