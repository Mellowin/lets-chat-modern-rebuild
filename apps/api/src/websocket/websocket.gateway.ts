import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { UsersRepository } from '../users/users.repository';

const websocketCorsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

@WebSocketGateway({
  cors: {
    origin: websocketCorsOrigin,
    credentials: true,
  },
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly usersRepository: UsersRepository,
  ) {}

  private getHandshakeToken(socket: Socket): string | null {
    const token = socket.handshake.auth?.token;

    if (typeof token !== 'string') {
      return null;
    }

    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
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
    const userId = socket.data.user?.id;
    this.logger.log({ socketId: socket.id, userId }, 'Socket disconnected');
  }
}
