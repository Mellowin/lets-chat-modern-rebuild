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
      this.gateway.broadcastToRoom(
        `channel:${channelId}`,
        'message:created',
        payload,
      );
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
      this.gateway.broadcastToRoom(
        `channel:${channelId}`,
        'message:updated',
        payload,
      );
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
      this.gateway.broadcastToRoom(
        `channel:${channelId}`,
        'message:deleted',
        payload,
      );
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
      this.gateway.broadcastToRoom(
        `channel:${channelId}`,
        'reaction:added',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          channelId,
          messageId: payload.messageId,
          error: (error as Error).message,
        },
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
      this.gateway.broadcastToRoom(
        `channel:${channelId}`,
        'reaction:removed',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          channelId,
          messageId: payload.messageId,
          error: (error as Error).message,
        },
        'Failed to broadcast reaction:removed',
      );
    }
  }

  broadcastReadReceipt(
    channelId: string,
    payload: {
      messageId: string;
      channelId: string;
      user: {
        id: string;
        username: string;
      };
      readAt: Date;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `channel:${channelId}`,
        'read:updated',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          channelId,
          messageId: payload.messageId,
          error: (error as Error).message,
        },
        'Failed to broadcast read:updated',
      );
    }
  }

  broadcastDirectMessageCreated(
    conversationId: string,
    payload: {
      id: string;
      conversationId: string;
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
      parent: {
        id: string;
        content: string;
        author: {
          id: string;
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
        };
      } | null;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `direct-conversation:${conversationId}`,
        'direct:message:created',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          conversationId,
          messageId: payload.id,
          error: (error as Error).message,
        },
        'Failed to broadcast direct:message:created',
      );
    }
  }

  broadcastDirectConversationUpdated(
    conversationId: string,
    payload: {
      id: string;
      conversationId: string;
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
      parent: {
        id: string;
        content: string;
        author: {
          id: string;
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
        };
      } | null;
    },
    participantUserIds: string[],
  ) {
    for (const userId of participantUserIds) {
      try {
        this.gateway.broadcastToRoom(
          `user:${userId}`,
          'direct:conversation:updated',
          payload,
        );
      } catch (error) {
        this.logger.error(
          {
            conversationId,
            userId,
            messageId: payload.id,
            error: (error as Error).message,
          },
          'Failed to broadcast direct:conversation:updated',
        );
      }
    }
  }
}
