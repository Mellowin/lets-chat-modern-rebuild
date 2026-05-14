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

const websocketCorsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
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

  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketRooms = new Map<string, Set<string>>();
  private readonly userRooms = new Map<string, Set<string>>();

  constructor(
    private readonly tokenService: TokenService,
    private readonly usersRepository: UsersRepository,
    private readonly channelsService: ChannelsService,
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
        this.logger.warn({ socketId }, 'Socket connection rejected: missing or malformed token');
        socket.emit('auth:error', { message: 'Access token missing' });
        socket.disconnect(true);
        return;
      }

      let payload;
      try {
        payload = await this.tokenService.verifyAccessToken(token);
      } catch {
        this.logger.warn({ socketId }, 'Socket connection rejected: invalid or expired token');
        socket.emit('auth:expired', { message: 'Invalid or expired access token' });
        socket.disconnect(true);
        return;
      }

      const user = await this.usersRepository.findById(payload.sub);
      if (!user) {
        this.logger.warn({ socketId, userId: payload.sub }, 'Socket connection rejected: user not found');
        socket.emit('auth:error', { message: 'User not found' });
        socket.disconnect(true);
        return;
      }

      socket.data.user = {
        id: user.id,
        email: user.email,
        username: user.username,
      };

      this.trackSocket(user.id, socketId);

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
    const rooms = this.socketRooms.get(socketId) ?? new Set();

    this.socketRooms.delete(socketId);

    if (userId) {
      this.untrackSocket(userId, socketId);

      for (const room of rooms) {
        const userSocketIds = this.userSockets.get(userId) ?? new Set();
        let otherSocketInRoom = false;
        for (const otherSocketId of userSocketIds) {
          if (this.socketRooms.get(otherSocketId)?.has(room)) {
            otherSocketInRoom = true;
            break;
          }
        }
        if (!otherSocketInRoom) {
          this.server.to(room).emit('presence:offline', {
            user: { id: userId, username: socket.data.user?.username },
            status: 'offline',
          });
          this.userRooms.get(userId)?.delete(room);
        }
      }

      if (!this.userSockets.has(userId)) {
        this.userRooms.delete(userId);
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
        { socketId: socket.id, userId, workspaceId, channelId, error: (error as Error).message },
        'Channel join error',
      );
      socket.emit('channel:error', { message: 'Failed to join channel' });
      return;
    }

    const room = `channel:${channelId}`;
    await socket.join(room);
    this.addSocketRoom(socket.id, room);
    this.addUserRoom(userId, room);

    socket.to(room).emit('presence:online', {
      user: { id: userId, username: socket.data.user?.username },
      status: 'online',
    });

    this.logger.log({ socketId: socket.id, userId, channelId }, 'Joined channel room');
    socket.emit('channel:joined', { workspaceId, channelId });
  }

  @SubscribeMessage('channel:leave')
  async handleChannelLeave(
    socket: Socket,
    payload: { channelId: unknown },
  ) {
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

    this.removeSocketRoom(socket.id, room);

    const userSocketIds = this.userSockets.get(userId) ?? new Set();
    let otherSocketInRoom = false;
    for (const otherSocketId of userSocketIds) {
      if (otherSocketId !== socket.id && this.socketRooms.get(otherSocketId)?.has(room)) {
        otherSocketInRoom = true;
        break;
      }
    }
    if (!otherSocketInRoom) {
      socket.to(room).emit('presence:offline', {
        user: { id: userId, username: socket.data.user?.username },
        status: 'offline',
      });
      this.userRooms.get(userId)?.delete(room);
    }

    await socket.leave(room);

    this.logger.log({ socketId: socket.id, userId, channelId }, 'Left channel room');
    socket.emit('channel:left', { channelId });
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    socket: Socket,
    payload: { channelId: unknown },
  ) {
    await this.broadcastTyping(socket, payload.channelId, 'typing:started');
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    socket: Socket,
    payload: { channelId: unknown },
  ) {
    await this.broadcastTyping(socket, payload.channelId, 'typing:stopped');
  }

  private async broadcastTyping(
    socket: Socket,
    channelId: unknown,
    event: 'typing:started' | 'typing:stopped',
  ) {
    const userId = this.getUserId(socket);
    if (!userId) {
      socket.emit('typing:error', { message: 'Not authenticated' });
      return;
    }

    if (!isValidUUID(channelId)) {
      socket.emit('typing:error', { message: 'Invalid UUID' });
      return;
    }

    const room = `channel:${channelId}`;
    if (!socket.rooms.has(room)) {
      socket.emit('typing:error', { message: 'Channel room not joined', channelId });
      return;
    }

    try {
      const user = await this.usersRepository.findById(userId);
      if (!user) return;

      socket.to(room).emit(event, {
        channelId,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    } catch (error) {
      this.logger.error(
        { socketId: socket.id, userId, channelId, event, error: (error as Error).message },
        'Typing broadcast error',
      );
    }
  }

  private trackSocket(userId: string, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  private untrackSocket(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  private addSocketRoom(socketId: string, room: string): void {
    if (!this.socketRooms.has(socketId)) {
      this.socketRooms.set(socketId, new Set());
    }
    this.socketRooms.get(socketId)!.add(room);
  }

  private removeSocketRoom(socketId: string, room: string): void {
    const rooms = this.socketRooms.get(socketId);
    if (rooms) {
      rooms.delete(room);
      if (rooms.size === 0) {
        this.socketRooms.delete(socketId);
      }
    }
  }

  private addUserRoom(userId: string, room: string): void {
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)!.add(room);
  }
}
