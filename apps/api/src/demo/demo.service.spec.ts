import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService, User } from '@lets-chat/database';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';
import { AuditService } from '../audit/audit.service';
import { DemoService } from './demo.service';

describe('DemoService', () => {
  let service: DemoService;

  const mockConfig = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const mockPrisma = {
    user: { findMany: jest.fn() },
    workspace: { findMany: jest.fn() },
    channel: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockUsers = {
    createUser: jest.fn(),
    markEmailVerified: jest.fn(),
  };

  const mockPassword = {
    hashPassword: jest.fn(),
  };

  const mockToken = {
    signAccessToken: jest.fn(),
    signRefreshToken: jest.fn(),
  };

  const mockRefreshTokens = {
    createToken: jest.fn(),
  };

  const mockWorkspaces = {
    create: jest.fn(),
  };

  const mockChannels = {
    create: jest.fn(),
  };

  const mockMessages = {
    create: jest.fn(),
  };

  const mockAudit = {
    record: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfig.get.mockImplementation((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        DEMO_MODE_ENABLED: true,
        DEMO_RATE_LIMIT_PER_HOUR: 10,
        DEMO_SESSION_TTL_HOURS: 24,
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return key in values ? values[key] : defaultValue;
    });
    mockConfig.getOrThrow.mockReturnValue('7d');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersRepository, useValue: mockUsers },
        { provide: PasswordService, useValue: mockPassword },
        { provide: TokenService, useValue: mockToken },
        { provide: RefreshTokensRepository, useValue: mockRefreshTokens },
        { provide: WorkspacesService, useValue: mockWorkspaces },
        { provide: ChannelsService, useValue: mockChannels },
        { provide: MessagesService, useValue: mockMessages },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<DemoService>(DemoService);
  });

  it('reports demo mode enabled from config', () => {
    expect(service.isDemoModeEnabled()).toBe(true);
  });

  it('creates a demo session with user, workspace, channels and tokens', async () => {
    const user: User = {
      id: 'user-id',
      email: 'demo-1-abc@lets-chat.demo',
      username: 'demo_user_abc',
      passwordHash: 'hash',
      role: 'USER',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      interfaceLanguage: 'en',
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
      emailVerificationSentAt: null,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockUsers.createUser.mockResolvedValue(user);
    mockUsers.markEmailVerified.mockResolvedValue(user);
    mockPassword.hashPassword.mockResolvedValue('password-hash');

    const workspace = {
      id: 'workspace-id',
      name: 'LetsChat Demo',
      slug: 'letschat-demo-1-abc',
    };
    mockWorkspaces.create.mockResolvedValue(workspace);

    mockChannels.create
      .mockResolvedValueOnce({
        id: 'channel-general',
        name: 'general',
        slug: 'general',
      })
      .mockResolvedValueOnce({
        id: 'channel-product',
        name: 'product',
        slug: 'product',
      })
      .mockResolvedValueOnce({
        id: 'channel-support',
        name: 'support',
        slug: 'support',
      });

    mockMessages.create.mockResolvedValue({ id: 'message-id' });
    mockToken.signAccessToken.mockResolvedValue('access-token');
    mockToken.signRefreshToken.mockResolvedValue('refresh-token');
    mockRefreshTokens.createToken.mockResolvedValue({ id: 'rt-id' });

    const result = await service.createSession('127.0.0.1', 'test-agent');

    expect(mockUsers.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.stringContaining('@lets-chat.demo'),
        username: expect.stringContaining('demo_user_'),
      }),
    );
    expect(mockUsers.markEmailVerified).toHaveBeenCalledWith('user-id');
    expect(mockWorkspaces.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LetsChat Demo' }),
      'user-id',
    );
    expect(mockChannels.create).toHaveBeenCalledTimes(3);
    expect(mockMessages.create).toHaveBeenCalledTimes(3);
    expect(mockToken.signAccessToken).toHaveBeenCalled();
    expect(mockToken.signRefreshToken).toHaveBeenCalled();
    expect(mockRefreshTokens.createToken).toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalled();

    expect(result.user.email).toBe(user.email);
    expect(result.workspace.id).toBe(workspace.id);
    expect(result.channels).toHaveLength(3);
    expect(result.defaultChannel.name).toBe('general');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });

  it('returns zero deletions when no stale demo users exist', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await service.cleanupOldDemoData();

    expect(result).toEqual({ usersDeleted: 0, workspacesDeleted: 0 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
