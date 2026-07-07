import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, User } from '@lets-chat/database';
import { createHash, randomBytes, randomUUID } from 'crypto';
import ms from 'ms';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';
import { JwtPayload } from '../auth/jwt-payload.type';
import { AuthUserResponse } from '../auth/auth.service';
import { DemoRateLimiter } from './demo-rate-limiter';
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_USERNAME_PREFIX,
  DEMO_WORKSPACE_NAME,
  DEMO_WORKSPACE_SLUG_PREFIX,
} from './demo.constants';

export interface DemoChannelInfo {
  id: string;
  name: string;
  slug: string;
}

export interface DemoWorkspaceInfo {
  id: string;
  name: string;
  slug: string;
}

export interface DemoSessionResult {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
  workspace: DemoWorkspaceInfo;
  channels: DemoChannelInfo[];
  defaultChannel: DemoChannelInfo;
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly rateLimiter: DemoRateLimiter;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly password: PasswordService,
    private readonly token: TokenService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly workspaces: WorkspacesService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
    private readonly audit: AuditService,
  ) {
    const limit = this.config.get<number>('DEMO_RATE_LIMIT_PER_HOUR', 10);
    this.rateLimiter = new DemoRateLimiter(limit);
  }

  isDemoModeEnabled(): boolean {
    return this.config.get<boolean>('DEMO_MODE_ENABLED', false) === true;
  }

  async createSession(
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<DemoSessionResult> {
    if (!this.isDemoModeEnabled()) {
      throw new NotFoundException();
    }

    if (!this.rateLimiter.isAllowed(ipAddress)) {
      throw new HttpException(
        'Demo session rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const timestamp = Date.now();
    const randomSuffix = randomBytes(8).toString('hex');
    const email = `demo-${timestamp}-${randomSuffix}@${DEMO_EMAIL_DOMAIN}`;
    const username = `${DEMO_USERNAME_PREFIX}${randomSuffix}`;
    const password = randomBytes(32).toString('hex');
    const passwordHash = await this.password.hashPassword(password);

    const user = await this.users.createUser({
      email,
      username,
      passwordHash,
    });
    await this.users.markEmailVerified(user.id);

    const workspaceSlug = `${DEMO_WORKSPACE_SLUG_PREFIX}${timestamp}-${randomSuffix}`;
    const workspace = await this.workspaces.create(
      { name: DEMO_WORKSPACE_NAME, slug: workspaceSlug },
      user.id,
    );

    const channelInputs = [
      { name: 'general', message: this.buildWelcomeMessage(username) },
      { name: 'product', message: this.buildMentionMessage(username) },
      { name: 'support', message: this.buildSafetyMessage() },
    ];

    const channels: DemoChannelInfo[] = [];
    for (const input of channelInputs) {
      const channel = await this.channels.create(
        workspace.id,
        { name: input.name, type: 'PUBLIC' },
        user.id,
      );
      await this.messages.create(
        workspace.id,
        channel.id,
        { content: input.message },
        user.id,
      );
      channels.push({ id: channel.id, name: channel.name, slug: channel.slug });
    }

    const defaultChannel = channels[0];

    const [accessToken, refreshToken] = await this.issueTokens(user);
    await this.persistRefreshToken(user.id, refreshToken, ipAddress, userAgent);

    await this.audit.record({
      actorId: user.id,
      action: AuditAction.DEMO_SESSION_CREATED,
      entityType: AuditEntityType.USER,
      entityId: user.id,
      severity: AuditSeverity.INFO,
      metadata: {
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        workspaceId: workspace.id,
      },
      ipAddress,
      userAgent,
    });

    this.logger.log(
      {
        userId: user.id,
        workspaceId: workspace.id,
        ipAddress: ipAddress ?? null,
      },
      'Demo session created',
    );

    return {
      user: this.toAuthUserResponse(user),
      accessToken,
      refreshToken,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      channels,
      defaultChannel,
    };
  }

  async cleanupOldDemoData(): Promise<{
    usersDeleted: number;
    workspacesDeleted: number;
  }> {
    const ttlHours = this.config.get<number>('DEMO_SESSION_TTL_HOURS', 24);
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);

    const demoUsers = await this.prisma.user.findMany({
      where: {
        email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
        username: { startsWith: DEMO_USERNAME_PREFIX },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    const userIds = demoUsers.map((u) => u.id);
    if (userIds.length === 0) {
      return { usersDeleted: 0, workspacesDeleted: 0 };
    }

    const demoWorkspaces = await this.prisma.workspace.findMany({
      where: {
        ownerId: { in: userIds },
        slug: { startsWith: DEMO_WORKSPACE_SLUG_PREFIX },
      },
      select: { id: true },
    });

    const workspaceIds = demoWorkspaces.map((w) => w.id);
    const channelIds =
      workspaceIds.length > 0
        ? (
            await this.prisma.channel.findMany({
              where: { workspaceId: { in: workspaceIds } },
              select: { id: true },
            })
          ).map((c) => c.id)
        : [];

    const messageIds =
      channelIds.length > 0
        ? (
            await this.prisma.message.findMany({
              where: { channelId: { in: channelIds } },
              select: { id: true },
            })
          ).map((m) => m.id)
        : [];

    await this.prisma.$transaction(async (tx) => {
      if (messageIds.length > 0) {
        await tx.reaction.deleteMany({
          where: { messageId: { in: messageIds } },
        });
        await tx.readReceipt.deleteMany({
          where: {
            OR: [
              { messageId: { in: messageIds } },
              { channelId: { in: channelIds } },
            ],
          },
        });
        await tx.messageEdit.deleteMany({
          where: { messageId: { in: messageIds } },
        });
        await tx.attachment.deleteMany({
          where: { messageId: { in: messageIds } },
        });
        await tx.message.deleteMany({
          where: { parentId: { in: messageIds } },
        });
        await tx.message.deleteMany({
          where: { id: { in: messageIds } },
        });
      }

      if (channelIds.length > 0) {
        await tx.channelMember.deleteMany({
          where: { channelId: { in: channelIds } },
        });
        await tx.channelReadState.deleteMany({
          where: { channelId: { in: channelIds } },
        });
        await tx.channelInvitation.deleteMany({
          where: { channelId: { in: channelIds } },
        });
        await tx.notification.deleteMany({
          where: { channelId: { in: channelIds } },
        });
        await tx.auditLog.deleteMany({
          where: { channelId: { in: channelIds } },
        });
        await tx.channel.deleteMany({
          where: { id: { in: channelIds } },
        });
      }

      if (workspaceIds.length > 0) {
        await tx.workspaceMember.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        });
        await tx.channelReadState.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        });
        await tx.notification.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        });
        await tx.auditLog.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        });
        await tx.invitation.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        });
        await tx.channelInvitation.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        });
        await tx.workspace.deleteMany({
          where: { id: { in: workspaceIds } },
        });
      }

      await tx.invitation.deleteMany({
        where: {
          OR: [{ invitedById: { in: userIds } }, { usedById: { in: userIds } }],
        },
      });
      await tx.channelInvitation.deleteMany({
        where: {
          OR: [{ invitedById: { in: userIds } }, { usedById: { in: userIds } }],
        },
      });
      await tx.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.notification.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.pushSubscription.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.channelReadState.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.readReceipt.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.channelMember.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.workspaceMember.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.auditLog.deleteMany({
        where: {
          OR: [{ actorId: { in: userIds } }, { targetUserId: { in: userIds } }],
        },
      });
      await tx.userContact.deleteMany({
        where: {
          OR: [
            { ownerUserId: { in: userIds } },
            { contactUserId: { in: userIds } },
          ],
        },
      });
      await tx.userBlock.deleteMany({
        where: {
          OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }],
        },
      });
      await tx.userReport.deleteMany({
        where: {
          OR: [
            { reporterId: { in: userIds } },
            { reportedUserId: { in: userIds } },
          ],
        },
      });

      await tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
    });

    return {
      usersDeleted: userIds.length,
      workspacesDeleted: workspaceIds.length,
    };
  }

  private async issueTokens(user: User): Promise<[string, string]> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };
    return Promise.all([
      this.token.signAccessToken(payload),
      this.token.signRefreshToken(payload),
    ]);
  }

  private async persistRefreshToken(
    userId: string,
    token: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    const expiresIn = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    const expiresAt = new Date(Date.now() + this.parseMs(expiresIn));
    await this.refreshTokens.createToken({
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseMs(value: string): number {
    const resolved = ms(value as ms.StringValue);
    if (typeof resolved !== 'number') {
      throw new Error(`Invalid duration: ${value}`);
    }
    return resolved;
  }

  private toAuthUserResponse(user: User): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      avatarUpdatedAt: user.avatarUpdatedAt ?? null,
      interfaceLanguage: (user.interfaceLanguage ?? 'en') as 'en' | 'uk' | 'ru',
      pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
      mentionNotificationsEnabled: user.mentionNotificationsEnabled ?? true,
      directMessageNotificationsEnabled:
        user.directMessageNotificationsEnabled ?? true,
      groupMessageNotificationsEnabled:
        user.groupMessageNotificationsEnabled ?? true,
      channelMessageNotificationsEnabled:
        user.channelMessageNotificationsEnabled ?? true,
      role: user.role ?? 'USER',
      createdAt: user.createdAt,
    };
  }

  private buildWelcomeMessage(username: string): string {
    return `Welcome to LetsChat, @${username}! This is a live demo workspace — feel free to explore channels, send messages, and try mentions.`;
  }

  private buildMentionMessage(username: string): string {
    return `Hey @${username}, mentions work like this. Try replying to any message to start a thread.`;
  }

  private buildSafetyMessage(): string {
    return 'Safety tools: you can block or report any user from their profile. Reports are reviewed by moderators.';
  }
}
