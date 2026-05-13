import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { ChannelsService } from '../channels/channels.service';
import { UsersRepository } from '../users/users.repository';
import { MessagesRepository } from './messages.repository';
import { ReactionsRepository } from './reactions.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { CreateReactionDto } from './dto/create-reaction.dto';

@Injectable()
export class ReactionsService {
  private readonly logger = new Logger(ReactionsService.name);

  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesRepository,
    private readonly reactions: ReactionsRepository,
    private readonly users: UsersRepository,
    private readonly websocketEvents: WebsocketEventsService,
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
        const restored = await this.reactions.restore(deleted.id);
        await this.broadcastReactionAdded(channelId, messageId, restored.emoji, userId);
        return restored;
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
      const created = await this.reactions.create({
        messageId,
        userId,
        emoji: dto.emoji,
      });
      await this.broadcastReactionAdded(channelId, messageId, created.emoji, userId);
      return created;
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
    await this.broadcastReactionRemoved(channelId, messageId, active.emoji, userId);
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

  private async broadcastReactionAdded(
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) {
    try {
      const user = await this.users.findById(userId);
      if (!user) return;

      this.websocketEvents.broadcastReactionAdded(channelId, {
        messageId,
        channelId,
        emoji,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    } catch (error) {
      this.logger.error(
        { channelId, messageId, userId, error: (error as Error).message },
        'Failed to prepare reaction:added broadcast',
      );
    }
  }

  private async broadcastReactionRemoved(
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) {
    try {
      const user = await this.users.findById(userId);
      if (!user) return;

      this.websocketEvents.broadcastReactionRemoved(channelId, {
        messageId,
        channelId,
        emoji,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    } catch (error) {
      this.logger.error(
        { channelId, messageId, userId, error: (error as Error).message },
        'Failed to prepare reaction:removed broadcast',
      );
    }
  }

  private async validateMessage(channelId: string, messageId: string) {
    const message = await this.messages.findById(messageId);
    if (!message || message.channelId !== channelId || message.deletedAt !== null) {
      throw new NotFoundException('Message not found');
    }
  }
}
