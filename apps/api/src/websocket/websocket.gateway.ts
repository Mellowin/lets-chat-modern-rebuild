import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { NotFoundException } from '@nestjs/common';
import { TokenService } from '../auth/token.service';
import { UsersRepository } from '../users/users.repository';
import { ChannelsService } from '../channels/channels.service';
import { PresenceService } from './presence.service';

const websocketCorsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

@WebSocketGateway({
  cors: {
    origin: websocketCorsOrigin,
    credentials: true,
  },
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly usersRepository: UsersRepository,
    private readonly channelsService: ChannelsService,
    private readonly presence: PresenceService,
  ) {}

  private getHandshakeToken(socket: Socket): string | null {
    const token = socket.handshake.auth?.token;

    if (typeof token !== 'string') {
      return null;
    }

    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private getUserId(socket: Socket): string | undefined {
    return socket.data.user?.id;
  }

  async handleConnection(socket: Socket) {
    const socketId = socket.id;

    try {
      const token = this.getHandshakeToken(socket);

      if (!token) {
        this.logger.warn(
          { socketId },
          'Socket connection rejected: missing or malformed token',
        );
        socket.emit('auth:error', { message: 'Access token missing' });
        socket.disconnect(true);
        return;
      }

      let payload;
      try {
        payload = await this.tokenService.verifyAccessToken(token);
      } catch {
        this.logger.warn(
          { socketId },
          'Socket connection rejected: invalid or expired token',
        );
        socket.emit('auth:expired', {
          message: 'Invalid or expired access token',
        });
        socket.disconnect(true);
        return;
      }

      const user = await this.usersRepository.findById(payload.sub);
      if (!user) {
        this.logger.warn(
          { socketId, userId: payload.sub },
          'Socket connection rejected: user not found',
        );
        socket.emit('auth:error', { message: 'User not found' });
        socket.disconnect(true);
        return;
      }

      socket.data.user = {
        id: user.id,
        email: user.email,
        username: user.username,
      };

      this.presence.trackSocket(user.id, socketId);

      this.logger.log({ socketId, userId: user.id }, 'Socket connected');
      socket.emit('connected', { userId: user.id });
    } catch (error) {
      this.logger.error(
        { socketId, error: (error as Error).message },
        'Unexpected error during socket connection',
      );
      socket.emit('auth:error', { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const socketId = socket.id;
    const userId = socket.data.user?.id;
    const rooms = this.presence.getSocketRooms(socketId);

    this.presence.clearSocket(socketId);

    if (userId) {
      this.presence.untrackSocket(userId, socketId);

      for (const room of rooms) {
        if (!this.presence.hasOtherSocketInRoom(userId, socketId, room)) {
          this.server.to(room).emit('presence:offline', {
            user: { id: userId, username: socket.data.user?.username },
            status: 'offline',
          });
          this.presence.removeUserRoom(userId, room);
        }
      }

      if (!this.presence.isUserTracked(userId)) {
        this.presence.clearUserRooms(userId);
      }
    }

    this.logger.log({ socketId, userId }, 'Socket disconnected');
  }

  broadcastToRoom(room: string, event: string, payload: unknown) {
    this.server.to(room).emit(event, payload);
  }

  @SubscribeMessage('channel:join')
  async handleChannelJoin(
    socket: Socket,
    payload: { workspaceId: unknown; channelId: unknown },
  ) {
    const userId = this.getUserId(socket);
    if (!userId) {
      socket.emit('channel:error', { message: 'Not authenticated' });
      return;
    }

    const { workspaceId, channelId } = payload;

    if (!isValidUUID(workspaceId) || !isValidUUID(channelId)) {
      socket.emit('channel:error', { message: 'Invalid UUID' });
      return;
    }

    try {
      await this.channelsService.findById(workspaceId, channelId, userId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        socket.emit('channel:error', { message: 'Channel not found' });
        return;
      }
      this.logger.error(
        {
          socketId: socket.id,
          userId,
          workspaceId,
          channelId,
          error: (error as Error).message,
        },
        'Channel join error',
      );
      socket.emit('channel:error', { message: 'Failed to join channel' });
      return;
    }

    const room = `channel:${channelId}`;
    await socket.join(room);
    this.presence.addSocketRoom(socket.id, room);
    this.presence.addUserRoom(userId, room);

    socket.to(room).emit('presence:online', {
      user: { id: userId, username: socket.data.user?.username },
      status: 'online',
    });

    this.logger.log(
      { socketId: socket.id, userId, channelId },
      'Joined channel room',
    );
    socket.emit('channel:joined', { workspaceId, channelId });
  }

  @SubscribeMessage('channel:leave')
  async handleChannelLeave(socket: Socket, payload: { channelId: unknown }) {
    const userId = this.getUserId(socket);
    if (!userId) {
      socket.emit('channel:error', { message: 'Not authenticated' });
      return;
    }

    const { channelId } = payload;

    if (!isValidUUID(channelId)) {
      socket.emit('channel:error', { message: 'Invalid UUID' });
      return;
    }

    const room = `channel:${channelId}`;

    if (!socket.rooms.has(room)) {
      socket.emit('channel:error', {
        message: 'Channel room not joined',
        channelId,
      });
      return;
    }

    this.presence.removeSocketRoom(socket.id, room);

    if (!this.presence.hasOtherSocketInRoom(userId, socket.id, room)) {
      socket.to(room).emit('presence:offline', {
        user: { id: userId, username: socket.data.user?.username },
        status: 'offline',
      });
      this.presence.removeUserRoom(userId, room);
    }

    await socket.leave(room);

    this.logger.log(
      { socketId: socket.id, userId, channelId },
      'Left channel room',
    );
    socket.emit('channel:left', { channelId });
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    socket: Socket,
    payload: { workspaceId: unknown; channelId: unknown },
  ) {
    await this.broadcastTyping(
      socket,
      payload.workspaceId,
      payload.channelId,
      'typing:started',
    );
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    socket: Socket,
    payload: { workspaceId: unknown; channelId: unknown },
  ) {
    await this.broadcastTyping(
      socket,
      payload.workspaceId,
      payload.channelId,
      'typing:stopped',
    );
  }

  private async broadcastTyping(
    socket: Socket,
    workspaceId: unknown,
    channelId: unknown,
    event: 'typing:started' | 'typing:stopped',
  ) {
    const userId = this.getUserId(socket);
    if (!userId) {
      socket.emit('typing:error', { message: 'Not authenticated' });
      return;
    }

    if (!isValidUUID(workspaceId) || !isValidUUID(channelId)) {
      socket.emit('typing:error', { message: 'Invalid UUID' });
      return;
    }

    const room = `channel:${channelId}`;
    if (!socket.rooms.has(room)) {
      socket.emit('typing:error', {
        message: 'Channel room not joined',
        channelId,
      });
      return;
    }

    try {
      await this.channelsService.findById(
        workspaceId,
        channelId,
        userId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        socket.emit('typing:error', {
          message: 'Channel access revoked',
          channelId,
        });
        this.presence.removeSocketRoom(socket.id, room);
        if (!this.presence.hasOtherSocketInRoom(userId, socket.id, room)) {
          socket.to(room).emit('presence:offline', {
            user: { id: userId, username: socket.data.user?.username },
            status: 'offline',
          });
          this.presence.removeUserRoom(userId, room);
        }
        await socket.leave(room);
        return;
      }
      this.logger.error(
        {
          socketId: socket.id,
          userId,
          workspaceId,
          channelId,
          error: (error as Error).message,
        },
        'Typing broadcast validation error',
      );
      socket.emit('typing:error', {
        message: 'Failed to validate channel access',
        channelId,
      });
      return;
    }

    const user = socket.data.user;
    if (!user?.username) {
      socket.emit('typing:error', { message: 'User data missing' });
      return;
    }

    socket.to(room).emit(event, {
      channelId,
      user: {
        id: userId,
        username: user.username,
      },
    });
  }
}
