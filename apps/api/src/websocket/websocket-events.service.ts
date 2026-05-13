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

  broadcastMessageUpdated(
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
      this.gateway.broadcastToRoom(`channel:${channelId}`, 'message:updated', payload);
    } catch (error) {
      this.logger.error(
        { channelId, messageId: payload.id, error: (error as Error).message },
        'Failed to broadcast message:updated',
      );
    }
  }

  broadcastMessageDeleted(
    channelId: string,
    payload: {
      id: string;
      channelId: string;
      deletedAt: Date;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(`channel:${channelId}`, 'message:deleted', payload);
    } catch (error) {
      this.logger.error(
        { channelId, messageId: payload.id, error: (error as Error).message },
        'Failed to broadcast message:deleted',
      );
    }
  }

  broadcastReactionAdded(
    channelId: string,
    payload: {
      messageId: string;
      channelId: string;
      emoji: string;
      user: {
        id: string;
        username: string;
      };
    },
  ) {
    try {
      this.gateway.broadcastToRoom(`channel:${channelId}`, 'reaction:added', payload);
    } catch (error) {
      this.logger.error(
        { channelId, messageId: payload.messageId, error: (error as Error).message },
        'Failed to broadcast reaction:added',
      );
    }
  }

  broadcastReactionRemoved(
    channelId: string,
    payload: {
      messageId: string;
      channelId: string;
      emoji: string;
      user: {
        id: string;
        username: string;
      };
    },
  ) {
    try {
      this.gateway.broadcastToRoom(`channel:${channelId}`, 'reaction:removed', payload);
    } catch (error) {
      this.logger.error(
        { channelId, messageId: payload.messageId, error: (error as Error).message },
        'Failed to broadcast reaction:removed',
      );
    }
  }
}
