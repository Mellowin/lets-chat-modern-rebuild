import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { UsersRepository } from '../users/users.repository';

@WebSocketGateway({
  cors: {
    origin: true,
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

  async handleConnection(socket: Socket) {
    const socketId = socket.id;

    try {
      const token = socket.handshake.auth.token as string | undefined;

      if (!token) {
        this.logger.warn({ socketId }, 'Socket connection rejected: missing token');
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
