import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebsocketGateway } from './websocket.gateway';
import { TokenService } from '../auth/token.service';
import { UsersRepository } from '../users/users.repository';
import { ChannelsService } from '../channels/channels.service';

function createMockSocket(overrides: Partial<Socket> = {}): Socket {
  const emitMock = jest.fn();
  const toMock = jest.fn().mockReturnValue({ emit: emitMock });
  const rooms = new Set<string>();

  return {
    id: 'socket-id-1',
    handshake: { auth: {} },
    data: {},
    rooms,
    emit: jest.fn(),
    to: toMock,
    join: jest.fn().mockImplementation((room: string) => {
      rooms.add(room);
      return Promise.resolve();
    }),
    leave: jest.fn().mockImplementation((room: string) => {
      rooms.delete(room);
      return Promise.resolve();
    }),
    disconnect: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function createMockServer(): Server {
  const emitMock = jest.fn();
  return {
    to: jest.fn().mockReturnValue({ emit: emitMock }),
  } as unknown as Server;
}

describe('WebsocketGateway', () => {
  let gateway: WebsocketGateway;
  let tokenService: jest.Mocked<TokenService>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let channelsService: jest.Mocked<ChannelsService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const channelId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebsocketGateway,
        {
          provide: TokenService,
          useValue: {
            verifyAccessToken: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: ChannelsService,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = moduleRef.get(WebsocketGateway);
    tokenService = moduleRef.get(TokenService);
    usersRepository = moduleRef.get(UsersRepository);
    channelsService = moduleRef.get(ChannelsService);

    gateway.server = createMockServer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should authenticate and emit connected event', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: ' valid-token ' } },
      });

      tokenService.verifyAccessToken.mockResolvedValue({ sub: userId });
      usersRepository.findById.mockResolvedValue({
        id: userId,
        email: 'test@test.com',
        username: 'testuser',
      } as any);

      await gateway.handleConnection(socket);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(socket.data.user).toEqual({
        id: userId,
        email: 'test@test.com',
        username: 'testuser',
      });
      expect(socket.emit).toHaveBeenCalledWith('connected', { userId });
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('should reject missing token', async () => {
      const socket = createMockSocket();

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Access token missing' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject empty string token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: '' } },
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Access token missing' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject whitespace-only token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: '   ' } },
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Access token missing' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject non-string token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: 123 as any } },
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Access token missing' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject invalid token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: 'invalid' } },
      });

      tokenService.verifyAccessToken.mockRejectedValue(new Error('bad token'));

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:expired', { message: 'Invalid or expired access token' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject when user not found', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: 'valid' } },
      });

      tokenService.verifyAccessToken.mockResolvedValue({ sub: userId });
      usersRepository.findById.mockResolvedValue(null);

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'User not found' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleChannelJoin', () => {
    it('should join room and emit channel:joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      channelsService.findById.mockResolvedValue({ id: channelId } as any);

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(channelsService.findById).toHaveBeenCalledWith(workspaceId, channelId, userId);
      expect(socket.join).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.emit).toHaveBeenCalledWith('channel:joined', { workspaceId, channelId });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Not authenticated' });
      expect(channelsService.findById).not.toHaveBeenCalled();
    });

    it('should reject invalid workspaceId UUID', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelJoin(socket, { workspaceId: 'bad', channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Invalid UUID' });
      expect(channelsService.findById).not.toHaveBeenCalled();
    });

    it('should reject invalid channelId UUID', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelJoin(socket, { workspaceId, channelId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Invalid UUID' });
      expect(channelsService.findById).not.toHaveBeenCalled();
    });

    it('should reject when channel not found', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      channelsService.findById.mockRejectedValue(new NotFoundException('Channel not found'));

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Channel not found' });
    });

    it('should emit generic error on unexpected failure', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      channelsService.findById.mockRejectedValue(new Error('db error'));

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Failed to join channel' });
    });
  });

  describe('handleChannelLeave', () => {
    it('should leave room and emit channel:left', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`channel:${channelId}`);

      await gateway.handleChannelLeave(socket, { channelId });

      expect(socket.leave).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.emit).toHaveBeenCalledWith('channel:left', { channelId });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleChannelLeave(socket, { channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Not authenticated' });
    });

    it('should reject invalid channelId', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelLeave(socket, { channelId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', { message: 'Invalid UUID' });
    });

    it('should reject when room not joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelLeave(socket, { channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Channel room not joined',
        channelId,
      });
    });
  });

  describe('handleTypingStart', () => {
    it('should broadcast typing:start to room excluding sender', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`channel:${channelId}`);

      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'testuser',
      } as any);

      await gateway.handleTypingStart(socket, { channelId });

      expect(socket.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).toHaveBeenCalledWith('typing:start', {
        channelId,
        user: { id: userId, username: 'testuser' },
      });
      expect(socket.emit).not.toHaveBeenCalledWith('typing:start', expect.anything());
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleTypingStart(socket, { channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', { message: 'Not authenticated' });
    });

    it('should reject invalid channelId', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleTypingStart(socket, { channelId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', { message: 'Invalid UUID' });
    });

    it('should reject when room not joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleTypingStart(socket, { channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Channel room not joined',
        channelId,
      });
    });

    it('should silently return when user not found', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`channel:${channelId}`);

      usersRepository.findById.mockResolvedValue(null);

      await gateway.handleTypingStart(socket, { channelId });

      expect(socket.to).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('typing:error', expect.anything());
    });
  });

  describe('handleTypingStop', () => {
    it('should broadcast typing:stop to room excluding sender', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`channel:${channelId}`);

      usersRepository.findById.mockResolvedValue({
        id: userId,
        username: 'testuser',
      } as any);

      await gateway.handleTypingStop(socket, { channelId });

      expect(socket.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).toHaveBeenCalledWith('typing:stop', {
        channelId,
        user: { id: userId, username: 'testuser' },
      });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleTypingStop(socket, { channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', { message: 'Not authenticated' });
    });
  });

  describe('broadcastToRoom', () => {
    it('should emit event via server.to', () => {
      gateway.broadcastToRoom('channel:1', 'test:event', { foo: 'bar' });

      expect(gateway.server.to).toHaveBeenCalledWith('channel:1');
      expect(gateway.server.to('channel:1').emit).toHaveBeenCalledWith('test:event', { foo: 'bar' });
    });
  });
});
