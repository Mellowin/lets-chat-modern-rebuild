import { Injectable } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';

@Injectable()
export class WebsocketEventsService {
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
    this.gateway.broadcastToRoom(`channel:${channelId}`, 'message:created', payload);
  }
}
