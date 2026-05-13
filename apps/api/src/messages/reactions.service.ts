import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
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
      try {
        return await this.reactions.restore(deleted.id);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Reaction already exists');
        }
        throw error;
      }
    }

    try {
      return await this.reactions.create({
        messageId,
        userId,
        emoji: dto.emoji,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Reaction already exists');
      }
      throw error;
    }
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

    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji || normalizedEmoji.length > 32) {
      throw new BadRequestException('Invalid emoji');
    }

    const active = await this.reactions.findActive(
      messageId,
      userId,
      normalizedEmoji,
    );
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
