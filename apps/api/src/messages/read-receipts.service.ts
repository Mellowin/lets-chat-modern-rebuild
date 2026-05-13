import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { MessagesRepository } from './messages.repository';
import { ReadReceiptsRepository } from './read-receipts.repository';

@Injectable()
export class ReadReceiptsService {
  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesRepository,
    private readonly readReceipts: ReadReceiptsRepository,
  ) {}

  async markAsRead(
    workspaceId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ) {
    await this.channels.findById(workspaceId, channelId, userId);
    await this.validateMessage(channelId, messageId);

    return this.readReceipts.upsert({
      messageId,
      userId,
      channelId,
    });
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

  private async validateMessage(channelId: string, messageId: string) {
    const message = await this.messages.findById(messageId);
    if (!message || message.channelId !== channelId || message.deletedAt !== null) {
      throw new NotFoundException('Message not found');
    }
  }
}
