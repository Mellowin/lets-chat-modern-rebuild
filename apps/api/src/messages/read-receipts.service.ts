import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { UsersRepository } from '../users/users.repository';
import { MessagesRepository } from './messages.repository';
import { ReadReceiptsRepository } from './read-receipts.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';

@Injectable()
export class ReadReceiptsService {
  private readonly logger = new Logger(ReadReceiptsService.name);

  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesRepository,
    private readonly readReceipts: ReadReceiptsRepository,
    private readonly users: UsersRepository,
    private readonly websocketEvents: WebsocketEventsService,
  ) {}

  async markAsRead(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    const receipt = await this.readReceipts.upsert({
      messageId,
      userId,
      channelId,
    });

    this.broadcastReadReceipt(channelId, messageId, receipt.readAt, userId);

    return receipt;
  }

  async listReadReceipts(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    return this.readReceipts.listForMessage(messageId);
  }

  private async broadcastReadReceipt(
    channelId: string,
    messageId: string,
    readAt: Date,
    userId: string,
  ) {
    try {
      const user = await this.users.findById(userId);
      if (!user) return;

      this.websocketEvents.broadcastReadReceipt(channelId, {
        messageId,
        channelId,
        user: {
          id: user.id,
          username: user.username,
        },
        readAt,
      });
    } catch (error) {
      this.logger.error(
        { channelId, messageId, userId, error: (error as Error).message },
        'Failed to prepare read:updated broadcast',
      );
    }
  }

  private async validateMessage(channelId: string, messageId: string) {
    const message = await this.messages.findById(messageId);
    if (
      !message ||
      message.channelId !== channelId ||
      message.deletedAt !== null
    ) {
      throw new NotFoundException('Message not found');
    }
  }
}
