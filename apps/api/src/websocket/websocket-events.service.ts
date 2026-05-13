import { Injectable, Logger } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';

@Injectable()
export class WebsocketEventsService {
  private readonly logger = new Logger(WebsocketEventsService.name);

  constructor(private readonly gateway: WebsocketGateway) {}

  broadcastMessageCreated(
    channelId: string,
    payload: {
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
    },
  ) {
    try {
      this.gateway.broadcastToRoom(`channel:${channelId}`, 'message:created', payload);
    } catch (error) {
      this.logger.error(
        { channelId, messageId: payload.id, error: (error as Error).message },
        'Failed to broadcast message:created',
      );
    }
  }
}
