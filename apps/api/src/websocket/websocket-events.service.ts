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
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe: boolean;
      }>;
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
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe: boolean;
      }>;
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
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe?: boolean;
      }>;
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
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe?: boolean;
      }>;
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

  broadcastDirectMessageUpdated(
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
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe: boolean;
      }>;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `direct-conversation:${conversationId}`,
        'direct:message:updated',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          conversationId,
          messageId: payload.id,
          error: (error as Error).message,
        },
        'Failed to broadcast direct:message:updated',
      );
    }
  }

  broadcastDirectConversationUpdated(
    conversationId: string,
    payload: unknown,
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
            error: (error as Error).message,
          },
          'Failed to broadcast direct:conversation:updated',
        );
      }
    }
  }

  broadcastDirectReactionAdded(
    conversationId: string,
    payload: {
      messageId: string;
      conversationId: string;
      emoji: string;
      user: {
        id: string;
        username: string;
      };
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe: boolean;
      }>;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `direct-conversation:${conversationId}`,
        'direct:reaction:added',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          conversationId,
          messageId: payload.messageId,
          error: (error as Error).message,
        },
        'Failed to broadcast direct:reaction:added',
      );
    }
  }

  broadcastDirectReactionRemoved(
    conversationId: string,
    payload: {
      messageId: string;
      conversationId: string;
      emoji: string;
      user: {
        id: string;
        username: string;
      };
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe: boolean;
      }>;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `direct-conversation:${conversationId}`,
        'direct:reaction:removed',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          conversationId,
          messageId: payload.messageId,
          error: (error as Error).message,
        },
        'Failed to broadcast direct:reaction:removed',
      );
    }
  }

  broadcastDirectMessageDeleted(
    conversationId: string,
    payload: {
      conversationId: string;
      messageId: string;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `direct-conversation:${conversationId}`,
        'direct:message:deleted',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          conversationId,
          messageId: payload.messageId,
          error: (error as Error).message,
        },
        'Failed to broadcast direct:message:deleted',
      );
    }
  }

  broadcastGroupMessageCreated(
    groupId: string,
    payload: {
      id: string;
      groupId: string;
      content: string;
      createdAt: Date;
      updatedAt: Date;
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
        `group-conversation:${groupId}`,
        'group:message:created',
        payload,
      );
    } catch (error) {
      this.logger.error(
        { groupId, messageId: payload.id, error: (error as Error).message },
        'Failed to broadcast group:message:created',
      );
    }
  }

  broadcastGroupConversationUpdated(
    groupId: string,
    payload: unknown,
    memberUserIds: string[],
  ) {
    for (const userId of memberUserIds) {
      try {
        this.gateway.broadcastToRoom(
          `user:${userId}`,
          'group:conversation:updated',
          payload,
        );
      } catch (error) {
        this.logger.error(
          { groupId, userId, error: (error as Error).message },
          'Failed to broadcast group:conversation:updated',
        );
      }
    }
  }

  broadcastGroupMemberRemoved(groupId: string, payload: { userId: string }) {
    try {
      this.gateway.broadcastToRoom(
        `group-conversation:${groupId}`,
        'group:member:removed',
        payload,
      );
    } catch (error) {
      this.logger.error(
        { groupId, userId: payload.userId, error: (error as Error).message },
        'Failed to broadcast group:member:removed',
      );
    }
  }

  broadcastGroupConversationRead(
    groupId: string,
    payload: {
      groupId: string;
      userId: string;
      readAt: string;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `group-conversation:${groupId}`,
        'group:conversation:read',
        payload,
      );
    } catch (error) {
      this.logger.error(
        { groupId, error: (error as Error).message },
        'Failed to broadcast group:conversation:read',
      );
    }
  }

  broadcastDirectConversationRead(
    conversationId: string,
    payload: {
      conversationId: string;
      userId: string;
      readAt: string;
    },
  ) {
    try {
      this.gateway.broadcastToRoom(
        `direct-conversation:${conversationId}`,
        'direct:conversation:read',
        payload,
      );
    } catch (error) {
      this.logger.error(
        {
          conversationId,
          error: (error as Error).message,
        },
        'Failed to broadcast direct:conversation:read',
      );
    }
  }
}
