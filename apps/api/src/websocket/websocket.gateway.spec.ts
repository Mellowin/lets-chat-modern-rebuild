import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { User, Channel } from '@lets-chat/database';
import { WebsocketGateway } from './websocket.gateway';
import { TokenService } from '../auth/token.service';
import { UsersRepository } from '../users/users.repository';
import { ChannelsService } from '../channels/channels.service';
import { DirectConversationsRepository } from '../direct-conversations/direct-conversations.repository';
import { PresenceService } from './presence.service';

function createMockSocket(overrides: Partial<Socket> = {}): Socket {
  const emitMock = jest.fn();
  const toMock = jest.fn().mockReturnValue({ emit: emitMock });
  const rooms = new Set<string>();

  return {
    id: 'socket-id-1',
    handshake: { auth: {} } as unknown as Socket['handshake'],
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
  let directConversations: jest.Mocked<DirectConversationsRepository>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const channelId = '33333333-3333-3333-3333-333333333333';
  const conversationId = '44444444-4444-4444-4444-444444444444';

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
        {
          provide: DirectConversationsRepository,
          useValue: {
            findParticipant: jest.fn(),
            findParticipants: jest.fn().mockResolvedValue([]),
          },
        },
        PresenceService,
      ],
    }).compile();

    gateway = moduleRef.get(WebsocketGateway);
    tokenService = moduleRef.get(TokenService);
    usersRepository = moduleRef.get(UsersRepository);
    channelsService = moduleRef.get(ChannelsService);
    directConversations = moduleRef.get(DirectConversationsRepository);

    gateway.server = createMockServer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should authenticate and emit connected event', async () => {
      const socket = createMockSocket({
        handshake: {
          auth: { token: ' valid-token ' },
        } as unknown as Socket['handshake'],
      });

      tokenService.verifyAccessToken.mockResolvedValue({
        sub: userId,
        email: 'test@test.com',
        jti: 'jti-1',
      });
      usersRepository.findById.mockResolvedValue({
        id: userId,
        email: 'test@test.com',
        username: 'testuser',
      } as User);

      await gateway.handleConnection(socket);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith(
        'valid-token',
      );
      expect(
        (
          socket.data as unknown as {
            user: { id: string; email: string; username: string };
          }
        ).user,
      ).toEqual({
        id: userId,
        email: 'test@test.com',
        username: 'testuser',
      });
      expect(socket.join).toHaveBeenCalledWith(`user:${userId}`);
      expect(socket.emit).toHaveBeenCalledWith('connected', { userId });
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('should reject missing token', async () => {
      const socket = createMockSocket();

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', {
        message: 'Access token missing',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject empty string token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: '' } } as unknown as Socket['handshake'],
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', {
        message: 'Access token missing',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject whitespace-only token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: '   ' } } as unknown as Socket['handshake'],
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', {
        message: 'Access token missing',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject non-string token', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: 123 } } as unknown as Socket['handshake'],
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', {
        message: 'Access token missing',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject invalid token', async () => {
      const socket = createMockSocket({
        handshake: {
          auth: { token: 'invalid' },
        } as unknown as Socket['handshake'],
      });

      tokenService.verifyAccessToken.mockRejectedValue(new Error('bad token'));

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:expired', {
        message: 'Invalid or expired access token',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject expired token', async () => {
      const socket = createMockSocket({
        handshake: {
          auth: { token: 'expired' },
        } as unknown as Socket['handshake'],
      });

      tokenService.verifyAccessToken.mockRejectedValue(
        new Error('jwt expired'),
      );

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:expired', {
        message: 'Invalid or expired access token',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reject when user not found', async () => {
      const socket = createMockSocket({
        handshake: {
          auth: { token: 'valid' },
        } as unknown as Socket['handshake'],
      });

      tokenService.verifyAccessToken.mockResolvedValue({
        sub: userId,
        email: 'test@test.com',
        jti: 'jti-1',
      });
      usersRepository.findById.mockResolvedValue(null);

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('auth:error', {
        message: 'User not found',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleChannelJoin', () => {
    it('should join room and emit channel:joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      channelsService.findById.mockResolvedValue({ id: channelId } as Channel);

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(channelsService.findById).toHaveBeenCalledWith(
        workspaceId,
        channelId,
        userId,
      );
      expect(socket.join).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.emit).toHaveBeenCalledWith('channel:joined', {
        workspaceId,
        channelId,
      });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Not authenticated',
      });
      expect(channelsService.findById).not.toHaveBeenCalled();
    });

    it('should reject invalid workspaceId UUID', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelJoin(socket, {
        workspaceId: 'bad',
        channelId,
      });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Invalid UUID',
      });
      expect(channelsService.findById).not.toHaveBeenCalled();
    });

    it('should reject invalid channelId UUID', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelJoin(socket, {
        workspaceId,
        channelId: 'bad',
      });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Invalid UUID',
      });
      expect(channelsService.findById).not.toHaveBeenCalled();
    });

    it('should reject when channel not found', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Channel not found',
      });
    });

    it('should emit generic error on unexpected failure', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      channelsService.findById.mockRejectedValue(new Error('db error'));

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Failed to join channel',
      });
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

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Not authenticated',
      });
    });

    it('should reject invalid channelId', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleChannelLeave(socket, { channelId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('channel:error', {
        message: 'Invalid UUID',
      });
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
    it('should broadcast typing:started with socket user data', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket.rooms.add(`channel:${channelId}`);

      channelsService.findById.mockResolvedValue({ id: channelId } as Channel);

      await gateway.handleTypingStart(socket, { workspaceId, channelId });

      expect(channelsService.findById).toHaveBeenCalledWith(
        workspaceId,
        channelId,
        userId,
      );
      expect(socket.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).toHaveBeenCalledWith(
        'typing:started',
        {
          channelId,
          user: { id: userId, username: 'testuser' },
        },
      );
      expect(socket.emit).not.toHaveBeenCalledWith(
        'typing:start',
        expect.anything(),
      );
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleTypingStart(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Not authenticated',
      });
    });

    it('should reject invalid workspaceId', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser' } },
      });

      await gateway.handleTypingStart(socket, {
        workspaceId: 'bad',
        channelId,
      });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Invalid UUID',
      });
    });

    it('should reject invalid channelId', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser' } },
      });

      await gateway.handleTypingStart(socket, {
        workspaceId,
        channelId: 'bad',
      });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Invalid UUID',
      });
    });

    it('should reject when room not joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser' } },
      });

      await gateway.handleTypingStart(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Channel room not joined',
        channelId,
      });
    });

    it('should reject when user data is missing', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`channel:${channelId}`);

      channelsService.findById.mockResolvedValue({ id: channelId } as Channel);

      await gateway.handleTypingStart(socket, { workspaceId, channelId });

      expect(socket.to).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'User data missing',
      });
    });

    it('should leave room and emit error when channel access is revoked', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket.rooms.add(`channel:${channelId}`);

      channelsService.findById.mockRejectedValue(
        new NotFoundException('Channel not found'),
      );

      await gateway.handleTypingStart(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Channel access revoked',
        channelId,
      });
      expect(socket.leave).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).not.toHaveBeenCalledWith(
        'typing:started',
        expect.anything(),
      );
    });
  });

  describe('handleTypingStop', () => {
    it('should broadcast typing:stopped with socket user data', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket.rooms.add(`channel:${channelId}`);

      channelsService.findById.mockResolvedValue({ id: channelId } as Channel);

      await gateway.handleTypingStop(socket, { workspaceId, channelId });

      expect(channelsService.findById).toHaveBeenCalledWith(
        workspaceId,
        channelId,
        userId,
      );
      expect(socket.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).toHaveBeenCalledWith(
        'typing:stopped',
        {
          channelId,
          user: { id: userId, username: 'testuser' },
        },
      );
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleTypingStop(socket, { workspaceId, channelId });

      expect(socket.emit).toHaveBeenCalledWith('typing:error', {
        message: 'Not authenticated',
      });
    });
  });

  describe('presence', () => {
    it('should track socket on authenticated connection', async () => {
      const socket = createMockSocket({
        id: 'socket-a',
        handshake: {
          auth: { token: 'valid' },
        } as unknown as Socket['handshake'],
      });

      tokenService.verifyAccessToken.mockResolvedValue({
        sub: userId,
        email: 'test@test.com',
        jti: 'jti-1',
      });
      usersRepository.findById.mockResolvedValue({
        id: userId,
        email: 'test@test.com',
        username: 'testuser',
      } as User);

      await gateway.handleConnection(socket);

      expect(gateway['presence']['userSockets'].get(userId)).toContain(
        'socket-a',
      );
    });

    it('should not track unauthenticated socket', async () => {
      const socket = createMockSocket({
        id: 'socket-b',
      });

      await gateway.handleConnection(socket);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(false);
    });

    it('should emit presence:online on channel join', async () => {
      const socket = createMockSocket({
        id: 'socket-c',
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket.rooms.add(`channel:${channelId}`);

      channelsService.findById.mockResolvedValue({ id: channelId } as Channel);

      await gateway.handleChannelJoin(socket, { workspaceId, channelId });

      expect(socket.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).toHaveBeenCalledWith(
        'presence:online',
        {
          user: { id: userId, username: 'testuser' },
          status: 'online',
        },
      );
      expect(gateway['presence']['userRooms'].get(userId)).toContain(
        `channel:${channelId}`,
      );
    });

    it('should emit presence:offline on channel leave when no other socket in room', async () => {
      const socket = createMockSocket({
        id: 'socket-d1',
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket.rooms.add(`channel:${channelId}`);
      gateway['presence']['userSockets'].set(
        userId,
        new Set(['socket-d1', 'socket-d2']),
      );
      gateway['presence']['socketRooms'].set(
        'socket-d1',
        new Set([`channel:${channelId}`]),
      );
      gateway['presence']['socketRooms'].set('socket-d2', new Set());
      gateway['presence']['userRooms'].set(
        userId,
        new Set([`channel:${channelId}`]),
      );

      await gateway.handleChannelLeave(socket, { channelId });

      expect(socket.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket.to(`channel:${channelId}`).emit).toHaveBeenCalledWith(
        'presence:offline',
        {
          user: { id: userId, username: 'testuser' },
          status: 'offline',
        },
      );
      expect(
        gateway['presence']['userRooms']
          .get(userId)
          ?.has(`channel:${channelId}`),
      ).toBe(false);
    });

    it('should not emit offline on leave when another socket still in room', async () => {
      const socket1 = createMockSocket({
        id: 'socket-e1',
        data: { user: { id: userId, username: 'testuser' } },
      });
      const socket2 = createMockSocket({
        id: 'socket-e2',
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket1.rooms.add(`channel:${channelId}`);
      socket2.rooms.add(`channel:${channelId}`);
      gateway['presence']['userSockets'].set(
        userId,
        new Set(['socket-e1', 'socket-e2']),
      );
      gateway['presence']['socketRooms'].set(
        'socket-e1',
        new Set([`channel:${channelId}`]),
      );
      gateway['presence']['socketRooms'].set(
        'socket-e2',
        new Set([`channel:${channelId}`]),
      );
      gateway['presence']['userRooms'].set(
        userId,
        new Set([`channel:${channelId}`]),
      );

      await gateway.handleChannelLeave(socket1, { channelId });

      expect(socket1.to).not.toHaveBeenCalled();
      expect(
        gateway['presence']['userRooms']
          .get(userId)
          ?.has(`channel:${channelId}`),
      ).toBe(true);

      await gateway.handleChannelLeave(socket2, { channelId });

      expect(socket2.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(socket2.to(`channel:${channelId}`).emit).toHaveBeenCalledWith(
        'presence:offline',
        {
          user: { id: userId, username: 'testuser' },
          status: 'offline',
        },
      );
      expect(
        gateway['presence']['userRooms']
          .get(userId)
          ?.has(`channel:${channelId}`),
      ).toBe(false);
    });

    it('should emit presence:offline on last socket disconnect', async () => {
      const socket = createMockSocket({
        id: 'socket-f',
        data: { user: { id: userId, username: 'testuser' } },
      });
      gateway['presence']['userSockets'].set(userId, new Set(['socket-f']));
      gateway['presence']['socketRooms'].set(
        'socket-f',
        new Set([`channel:${channelId}`]),
      );
      gateway['presence']['userRooms'].set(
        userId,
        new Set([`channel:${channelId}`]),
      );

      await gateway.handleDisconnect(socket);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(false);
      expect(gateway.server.to).toHaveBeenCalledWith(`channel:${channelId}`);
      expect(
        gateway.server.to(`channel:${channelId}`).emit,
      ).toHaveBeenCalledWith('presence:offline', {
        user: { id: userId, username: 'testuser' },
        status: 'offline',
      });
    });

    it('should emit room offline on disconnect when no other socket in that room', async () => {
      const socket1 = createMockSocket({
        id: 'socket-g1',
        data: { user: { id: userId, username: 'testuser' } },
      });
      const socket2 = createMockSocket({
        id: 'socket-g2',
        data: { user: { id: userId, username: 'testuser' } },
      });
      const room1 = `channel:${channelId}`;
      const room2 = `channel:44444444-4444-4444-4444-444444444444`;

      gateway['presence']['userSockets'].set(
        userId,
        new Set(['socket-g1', 'socket-g2']),
      );
      gateway['presence']['socketRooms'].set('socket-g1', new Set([room1]));
      gateway['presence']['socketRooms'].set('socket-g2', new Set([room2]));
      gateway['presence']['userRooms'].set(userId, new Set([room1, room2]));

      await gateway.handleDisconnect(socket1);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(true);
      expect(gateway['presence']['userSockets'].get(userId)).toContain(
        'socket-g2',
      );
      expect(gateway.server.to).toHaveBeenCalledWith(room1);
      expect(gateway.server.to(room1).emit).toHaveBeenCalledWith(
        'presence:offline',
        {
          user: { id: userId, username: 'testuser' },
          status: 'offline',
        },
      );
      expect(gateway['presence']['userRooms'].get(userId)?.has(room1)).toBe(
        false,
      );
      expect(gateway['presence']['userRooms'].get(userId)?.has(room2)).toBe(
        true,
      );

      await gateway.handleDisconnect(socket2);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(false);
      expect(gateway.server.to).toHaveBeenCalledWith(room2);
      expect(gateway.server.to(room2).emit).toHaveBeenCalledWith(
        'presence:offline',
        {
          user: { id: userId, username: 'testuser' },
          status: 'offline',
        },
      );
      expect(gateway['presence']['userRooms'].has(userId)).toBe(false);
    });

    it('should not emit offline on disconnect when another socket still in same room', async () => {
      const socket1 = createMockSocket({
        id: 'socket-h1',
        data: { user: { id: userId, username: 'testuser' } },
      });
      const socket2 = createMockSocket({
        id: 'socket-h2',
        data: { user: { id: userId, username: 'testuser' } },
      });
      const room = `channel:${channelId}`;

      gateway['presence']['userSockets'].set(
        userId,
        new Set(['socket-h1', 'socket-h2']),
      );
      gateway['presence']['socketRooms'].set('socket-h1', new Set([room]));
      gateway['presence']['socketRooms'].set('socket-h2', new Set([room]));
      gateway['presence']['userRooms'].set(userId, new Set([room]));

      await gateway.handleDisconnect(socket1);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(true);
      expect(gateway.server.to).not.toHaveBeenCalled();
      expect(gateway['presence']['userRooms'].get(userId)?.has(room)).toBe(
        true,
      );

      await gateway.handleDisconnect(socket2);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(false);
      expect(gateway.server.to).toHaveBeenCalledWith(room);
      expect(gateway.server.to(room).emit).toHaveBeenCalledWith(
        'presence:offline',
        {
          user: { id: userId, username: 'testuser' },
          status: 'offline',
        },
      );
      expect(gateway['presence']['userRooms'].has(userId)).toBe(false);
    });
  });

  describe('broadcastToRoom', () => {
    it('should emit event via server.to', () => {
      gateway.broadcastToRoom('channel:1', 'test:event', { foo: 'bar' });

      expect(gateway.server.to).toHaveBeenCalledWith('channel:1');
      expect(gateway.server.to('channel:1').emit).toHaveBeenCalledWith(
        'test:event',
        { foo: 'bar' },
      );
    });
  });

  describe('handleDirectJoin', () => {
    it('should join room and emit direct:joined when user is participant', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      directConversations.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      await gateway.handleDirectJoin(socket, { conversationId });

      expect(directConversations.findParticipant).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
      expect(socket.join).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(socket.emit).toHaveBeenCalledWith('direct:joined', {
        conversationId,
      });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleDirectJoin(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:error', {
        message: 'Not authenticated',
      });
      expect(directConversations.findParticipant).not.toHaveBeenCalled();
    });

    it('should reject invalid conversationId UUID', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleDirectJoin(socket, { conversationId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('direct:error', {
        message: 'Invalid UUID',
      });
    });

    it('should reject when user is not a participant', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      directConversations.findParticipant.mockResolvedValue(null);

      await gateway.handleDirectJoin(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:error', {
        message: 'Access denied',
      });
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDirectLeave', () => {
    it('should leave room and emit direct:left', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);

      await gateway.handleDirectLeave(socket, { conversationId });

      expect(socket.leave).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(socket.emit).toHaveBeenCalledWith('direct:left', {
        conversationId,
      });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleDirectLeave(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:error', {
        message: 'Not authenticated',
      });
    });

    it('should reject invalid conversationId UUID', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleDirectLeave(socket, { conversationId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('direct:error', {
        message: 'Invalid UUID',
      });
    });

    it('should reject when room not joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });

      await gateway.handleDirectLeave(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:error', {
        message: 'Direct conversation room not joined',
        conversationId,
      });
    });
  });

  describe('handleDirectJoin presence', () => {
    it('should emit presence:online on direct join', async () => {
      const socket = createMockSocket({
        data: {
          user: { id: userId, username: 'testuser', displayName: 'Test User' },
        },
      });

      directConversations.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      await gateway.handleDirectJoin(socket, { conversationId });

      expect(socket.to).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(
        socket.to(`direct-conversation:${conversationId}`).emit,
      ).toHaveBeenCalledWith('presence:online', {
        user: { id: userId, username: 'testuser', displayName: 'Test User' },
        status: 'online',
      });
    });

    it('should emit presence:offline on direct leave when no other socket in room', async () => {
      const socket = createMockSocket({
        id: 'socket-d1',
        data: {
          user: { id: userId, username: 'testuser', displayName: 'Test User' },
        },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);
      gateway['presence']['userSockets'].set(
        userId,
        new Set(['socket-d1', 'socket-d2']),
      );
      gateway['presence']['socketRooms'].set(
        'socket-d1',
        new Set([`direct-conversation:${conversationId}`]),
      );
      gateway['presence']['socketRooms'].set('socket-d2', new Set());
      gateway['presence']['userRooms'].set(
        userId,
        new Set([`direct-conversation:${conversationId}`]),
      );

      await gateway.handleDirectLeave(socket, { conversationId });

      expect(socket.to).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(
        socket.to(`direct-conversation:${conversationId}`).emit,
      ).toHaveBeenCalledWith('presence:offline', {
        user: { id: userId, username: 'testuser', displayName: 'Test User' },
        status: 'offline',
      });
    });

    it('should not emit offline on direct leave when another socket still in room', async () => {
      const socket1 = createMockSocket({
        id: 'socket-e1',
        data: { user: { id: userId, username: 'testuser' } },
      });
      const socket2 = createMockSocket({
        id: 'socket-e2',
        data: { user: { id: userId, username: 'testuser' } },
      });
      socket1.rooms.add(`direct-conversation:${conversationId}`);
      socket2.rooms.add(`direct-conversation:${conversationId}`);
      gateway['presence']['userSockets'].set(
        userId,
        new Set(['socket-e1', 'socket-e2']),
      );
      gateway['presence']['socketRooms'].set(
        'socket-e1',
        new Set([`direct-conversation:${conversationId}`]),
      );
      gateway['presence']['socketRooms'].set(
        'socket-e2',
        new Set([`direct-conversation:${conversationId}`]),
      );
      gateway['presence']['userRooms'].set(
        userId,
        new Set([`direct-conversation:${conversationId}`]),
      );

      await gateway.handleDirectLeave(socket1, { conversationId });

      expect(socket1.to).not.toHaveBeenCalled();
    });

    it('should emit presence:offline on disconnect for direct room', async () => {
      const socket = createMockSocket({
        id: 'socket-f',
        data: {
          user: { id: userId, username: 'testuser', displayName: 'Test User' },
        },
      });
      gateway['presence']['userSockets'].set(userId, new Set(['socket-f']));
      gateway['presence']['socketRooms'].set(
        'socket-f',
        new Set([`direct-conversation:${conversationId}`]),
      );
      gateway['presence']['userRooms'].set(
        userId,
        new Set([`direct-conversation:${conversationId}`]),
      );

      await gateway.handleDisconnect(socket);

      expect(gateway['presence']['userSockets'].has(userId)).toBe(false);
      expect(gateway.server.to).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(
        gateway.server.to(`direct-conversation:${conversationId}`).emit,
      ).toHaveBeenCalledWith('presence:offline', {
        user: { id: userId, username: 'testuser', displayName: 'Test User' },
        status: 'offline',
      });
    });
  });

  describe('handleDirectTypingStart', () => {
    it('should broadcast direct:typing with isTyping true for participant', async () => {
      const socket = createMockSocket({
        data: {
          user: { id: userId, username: 'testuser', displayName: 'Test User' },
        },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);

      directConversations.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      await gateway.handleDirectTypingStart(socket, { conversationId });

      expect(directConversations.findParticipant).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
      expect(socket.to).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(
        socket.to(`direct-conversation:${conversationId}`).emit,
      ).toHaveBeenCalledWith('direct:typing', {
        conversationId,
        user: { id: userId, username: 'testuser', displayName: 'Test User' },
        isTyping: true,
      });
    });

    it('should reject when not authenticated', async () => {
      const socket = createMockSocket();

      await gateway.handleDirectTypingStart(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:typing:error', {
        message: 'Not authenticated',
      });
    });

    it('should reject invalid conversationId', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser', displayName: null } },
      });

      await gateway.handleDirectTypingStart(socket, { conversationId: 'bad' });

      expect(socket.emit).toHaveBeenCalledWith('direct:typing:error', {
        message: 'Invalid UUID',
      });
    });

    it('should reject when room not joined', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser', displayName: null } },
      });

      await gateway.handleDirectTypingStart(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:typing:error', {
        message: 'Direct conversation room not joined',
        conversationId,
      });
    });

    it('should reject when user is not a participant', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser', displayName: null } },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);

      directConversations.findParticipant.mockResolvedValue(null);

      await gateway.handleDirectTypingStart(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:typing:error', {
        message: 'Access denied',
        conversationId,
      });
    });

    it('should reject when user data is missing', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId } },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);

      directConversations.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      await gateway.handleDirectTypingStart(socket, { conversationId });

      expect(socket.to).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('direct:typing:error', {
        message: 'User data missing',
      });
    });
  });

  describe('handleDirectTypingStop', () => {
    it('should broadcast direct:typing with isTyping false for participant', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser', displayName: null } },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);

      directConversations.findParticipant.mockResolvedValue({
        id: 'p1',
        conversationId,
        userId,
        createdAt: new Date(),
        lastReadAt: new Date(),
      });

      await gateway.handleDirectTypingStop(socket, { conversationId });

      expect(directConversations.findParticipant).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
      expect(socket.to).toHaveBeenCalledWith(
        `direct-conversation:${conversationId}`,
      );
      expect(
        socket.to(`direct-conversation:${conversationId}`).emit,
      ).toHaveBeenCalledWith('direct:typing', {
        conversationId,
        user: { id: userId, username: 'testuser', displayName: null },
        isTyping: false,
      });
    });

    it('should reject non-participant', async () => {
      const socket = createMockSocket({
        data: { user: { id: userId, username: 'testuser', displayName: null } },
      });
      socket.rooms.add(`direct-conversation:${conversationId}`);

      directConversations.findParticipant.mockResolvedValue(null);

      await gateway.handleDirectTypingStop(socket, { conversationId });

      expect(socket.emit).toHaveBeenCalledWith('direct:typing:error', {
        message: 'Access denied',
        conversationId,
      });
    });
  });
});
