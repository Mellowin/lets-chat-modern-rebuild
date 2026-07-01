import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lets-chat/database';
import * as webpush from 'web-push';
import { BlocksService } from '../safety/blocks.service';
import { PushRepository } from './push.repository';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

const NOTIFICATION_ICON = '/icon.svg';
const NOTIFICATION_BADGE = '/icon.svg';
const MAX_BODY_LENGTH = 120;

type Locale = 'en' | 'uk' | 'ru';

function getGroupNotificationStrings(
  locale: Locale,
  senderName: string,
  content: string,
) {
  const hasContent = content.trim().length > 0;
  const body = hasContent ? truncateBody(content) : '';

  switch (locale) {
    case 'uk':
      return {
        title: hasContent
          ? `${senderName}: нове повідомлення в групі`
          : `${senderName}: надіслано файл`,
        body: hasContent ? body : 'У групі надіслано файл',
      };
    case 'ru':
      return {
        title: hasContent
          ? `${senderName}: новое сообщение в группе`
          : `${senderName}: отправлен файл`,
        body: hasContent ? body : 'В группе отправлен файл',
      };
    case 'en':
    default:
      return {
        title: hasContent
          ? `${senderName}: New group message`
          : `${senderName}: File shared`,
        body: hasContent ? body : 'A file was shared in the group',
      };
  }
}

function getMentionNotificationStrings(
  locale: Locale,
  senderName: string,
  context: 'channel' | 'group' | 'direct',
  channelOrGroupName?: string,
) {
  switch (locale) {
    case 'uk':
      if (context === 'direct') {
        return {
          title: `${senderName} згадав(ла) вас`,
          body: 'У вас нове згадування в приватному повідомленні',
        };
      }
      return {
        title: `${senderName} згадав(ла) вас`,
        body: channelOrGroupName
          ? `У ${context === 'channel' ? 'каналі' : 'групі'} ${channelOrGroupName}`
          : 'У вас нове згадування',
      };
    case 'ru':
      if (context === 'direct') {
        return {
          title: `${senderName} упомянул(а) вас`,
          body: 'У вас новое упоминание в личном сообщении',
        };
      }
      return {
        title: `${senderName} упомянул(а) вас`,
        body: channelOrGroupName
          ? `В ${context === 'channel' ? 'канале' : 'группе'} ${channelOrGroupName}`
          : 'У вас новое упоминание',
      };
    case 'en':
    default:
      if (context === 'direct') {
        return {
          title: `${senderName} mentioned you`,
          body: 'You have a new mention in a direct message',
        };
      }
      return {
        title: `${senderName} mentioned you`,
        body: channelOrGroupName
          ? `In ${context} ${channelOrGroupName}`
          : 'You have a new mention',
      };
  }
}

function truncateBody(text: string): string {
  if (text.length <= MAX_BODY_LENGTH) return text;
  return `${text.slice(0, MAX_BODY_LENGTH - 1)}…`;
}

function deriveDeviceLabel(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('linux')) return 'Linux';
  return 'Web browser';
}

function endpointPreview(endpoint: string): string {
  if (endpoint.length <= 64) return endpoint;
  return `${endpoint.slice(0, 64)}…`;
}

export interface PushMessagePayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private vapidConfigured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly pushRepository: PushRepository,
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      this.logger.warn(
        'VAPID keys are not configured. Push notifications are disabled.',
      );
    }
  }

  getVapidPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  isVapidConfigured(): boolean {
    return this.vapidConfigured;
  }

  async saveSubscription(userId: string, dto: CreatePushSubscriptionDto) {
    await this.pushRepository.upsertSubscription(userId, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
  }

  async listSubscriptions(userId: string) {
    const subscriptions = await this.pushRepository.findByUserId(userId);
    return subscriptions.map((subscription) => ({
      id: subscription.id,
      endpointPreview: endpointPreview(subscription.endpoint),
      userAgent: subscription.userAgent,
      deviceLabel: deriveDeviceLabel(subscription.userAgent),
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      lastUsedAt: null,
      disabledAt: null,
    }));
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.pushRepository.deleteSubscription(userId, endpoint);
  }

  async notifyChannelMessage(
    channelId: string,
    message: { id: string; content: string; authorId: string },
  ) {
    if (!this.vapidConfigured) return;

    const [channel, sender] = await Promise.all([
      this.prisma.channel.findUnique({
        where: { id: channelId },
        include: { workspace: { select: { id: true, name: true } } },
      }),
      this.prisma.user.findUnique({
        where: { id: message.authorId },
        select: { displayName: true, username: true, interfaceLanguage: true },
      }),
    ]);

    if (!channel) return;

    const members = await this.prisma.channelMember.findMany({
      where: {
        channelId,
        deletedAt: null,
        userId: { not: message.authorId },
      },
      include: {
        user: {
          select: {
            id: true,
            pushNotificationsEnabled: true,
            channelMessageNotificationsEnabled: true,
            pushSubscriptions: true,
          },
        },
      },
    });

    if (members.length === 0) return;

    const blockerIds = new Set(
      await this.blocks.findBlockerIdsWhoBlockedUser(message.authorId),
    );
    const recipients = members.filter(
      (m) =>
        !blockerIds.has(m.user.id) &&
        m.user.pushNotificationsEnabled &&
        m.user.channelMessageNotificationsEnabled,
    );
    if (recipients.length === 0) return;

    const senderName = sender?.displayName ?? sender?.username ?? 'Someone';
    const title = `${senderName} in #${channel.name}`;
    const body =
      message.content.trim().length > 0
        ? truncateBody(message.content)
        : 'Sent an attachment';

    const payload: PushMessagePayload = {
      title,
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: {
        type: 'channel_message',
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        messageId: message.id,
      },
    };

    await Promise.all(
      recipients.flatMap((member) =>
        member.user.pushSubscriptions.map((subscription) =>
          this.sendNotification(subscription, payload),
        ),
      ),
    );
  }

  async notifyChannelMention(
    channelId: string,
    message: {
      id: string;
      content: string;
      authorId: string;
      mentions: { userId: string; username: string }[];
    },
  ) {
    if (!this.vapidConfigured) return;

    const [channel, sender] = await Promise.all([
      this.prisma.channel.findUnique({
        where: { id: channelId },
        include: { workspace: { select: { id: true, name: true } } },
      }),
      this.prisma.user.findUnique({
        where: { id: message.authorId },
        select: { displayName: true, username: true, interfaceLanguage: true },
      }),
    ]);

    if (!channel) return;

    const mentionedUserIds = new Set(message.mentions.map((m) => m.userId));
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: Array.from(mentionedUserIds) },
        pushNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
      },
      include: { pushSubscriptions: true },
    });

    if (users.length === 0) return;

    const blockerIds = new Set(
      await this.blocks.findBlockerIdsWhoBlockedUser(message.authorId),
    );
    const recipients = users.filter(
      (u) => u.id !== message.authorId && !blockerIds.has(u.id),
    );
    if (recipients.length === 0) return;

    const senderName = sender?.displayName ?? sender?.username ?? 'Someone';
    const locale = (sender?.interfaceLanguage as Locale) ?? 'en';
    const { title, body } = getMentionNotificationStrings(
      locale,
      senderName,
      'channel',
      `#${channel.name}`,
    );

    const payload: PushMessagePayload = {
      title,
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: {
        type: 'channel_mention',
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        messageId: message.id,
      },
    };

    await Promise.all(
      recipients.flatMap((user) =>
        user.pushSubscriptions.map((subscription) =>
          this.sendNotification(subscription, payload),
        ),
      ),
    );
  }

  async notifyDirectMessage(
    conversationId: string,
    message: { id: string; content: string; authorId: string },
  ) {
    if (!this.vapidConfigured) return;

    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          where: { userId: { not: message.authorId } },
          include: {
            user: {
              select: {
                id: true,
                pushNotificationsEnabled: true,
                directMessageNotificationsEnabled: true,
                pushSubscriptions: true,
              },
            },
          },
        },
      },
    });

    if (!conversation || conversation.participants.length === 0) return;

    const blockerIds = new Set(
      await this.blocks.findBlockerIdsWhoBlockedUser(message.authorId),
    );
    const recipients = conversation.participants.filter(
      (p) =>
        !blockerIds.has(p.userId) &&
        p.user.pushNotificationsEnabled &&
        p.user.directMessageNotificationsEnabled,
    );
    if (recipients.length === 0) return;

    const sender = await this.prisma.user.findUnique({
      where: { id: message.authorId },
      select: { displayName: true, username: true },
    });

    const senderName = sender?.displayName ?? sender?.username ?? 'Someone';
    const body =
      message.content.trim().length > 0
        ? truncateBody(message.content)
        : 'Sent a message';

    const payload: PushMessagePayload = {
      title: senderName,
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: {
        type: 'direct_message',
        conversationId,
        messageId: message.id,
      },
    };

    await Promise.all(
      recipients.flatMap((participant) =>
        participant.user.pushSubscriptions.map((subscription) =>
          this.sendNotification(subscription, payload),
        ),
      ),
    );
  }

  async notifyDirectMention(
    conversationId: string,
    message: {
      id: string;
      content: string;
      authorId: string;
      mentions: { userId: string; username: string }[];
    },
  ) {
    if (!this.vapidConfigured) return;

    const mentionedUserIds = new Set(message.mentions.map((m) => m.userId));
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: Array.from(mentionedUserIds) },
        pushNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
      },
      include: { pushSubscriptions: true },
    });

    if (users.length === 0) return;

    const blockerIds = new Set(
      await this.blocks.findBlockerIdsWhoBlockedUser(message.authorId),
    );
    const recipients = users.filter(
      (u) => u.id !== message.authorId && !blockerIds.has(u.id),
    );
    if (recipients.length === 0) return;

    const sender = await this.prisma.user.findUnique({
      where: { id: message.authorId },
      select: { displayName: true, username: true, interfaceLanguage: true },
    });

    const senderName = sender?.displayName ?? sender?.username ?? 'Someone';
    const locale = (sender?.interfaceLanguage as Locale) ?? 'en';
    const { title, body } = getMentionNotificationStrings(
      locale,
      senderName,
      'direct',
    );

    const payload: PushMessagePayload = {
      title,
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: {
        type: 'dm_mention',
        conversationId,
        messageId: message.id,
      },
    };

    await Promise.all(
      recipients.flatMap((user) =>
        user.pushSubscriptions.map((subscription) =>
          this.sendNotification(subscription, payload),
        ),
      ),
    );
  }

  async notifyGroupMessage(
    groupId: string,
    message: { id: string; content: string; authorId: string },
  ) {
    if (!this.vapidConfigured) return;

    const [group, sender] = await Promise.all([
      this.prisma.groupConversation.findUnique({
        where: { id: groupId },
      }),
      this.prisma.user.findUnique({
        where: { id: message.authorId },
        select: { displayName: true, username: true },
      }),
    ]);

    if (!group || group.archivedAt) return;

    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId,
        leftAt: null,
        userId: { not: message.authorId },
      },
      include: {
        user: {
          select: {
            id: true,
            interfaceLanguage: true,
            pushNotificationsEnabled: true,
            groupMessageNotificationsEnabled: true,
            pushSubscriptions: true,
          },
        },
      },
    });

    if (members.length === 0) return;

    const blockerIds = new Set(
      await this.blocks.findBlockerIdsWhoBlockedUser(message.authorId),
    );
    const recipients = members.filter(
      (m) =>
        !blockerIds.has(m.user.id) &&
        m.user.pushNotificationsEnabled &&
        m.user.groupMessageNotificationsEnabled,
    );
    if (recipients.length === 0) return;

    const senderName = sender?.displayName ?? sender?.username ?? 'Someone';

    await Promise.all(
      recipients.flatMap((member) => {
        const locale = (member.user.interfaceLanguage as Locale) ?? 'en';
        const { title, body } = getGroupNotificationStrings(
          locale,
          senderName,
          message.content,
        );
        const payload: PushMessagePayload = {
          title,
          body,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_BADGE,
          data: {
            type: 'group_message',
            groupId: group.id,
            messageId: message.id,
          },
        };
        return member.user.pushSubscriptions.map((subscription) =>
          this.sendNotification(subscription, payload),
        );
      }),
    );
  }

  async notifyGroupMention(
    groupId: string,
    message: {
      id: string;
      content: string;
      authorId: string;
      mentions: { userId: string; username: string }[];
    },
  ) {
    if (!this.vapidConfigured) return;

    const group = await this.prisma.groupConversation.findUnique({
      where: { id: groupId },
    });
    if (!group || group.archivedAt) return;

    const mentionedUserIds = new Set(message.mentions.map((m) => m.userId));
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: Array.from(mentionedUserIds) },
        pushNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
      },
      include: { pushSubscriptions: true },
    });

    if (users.length === 0) return;

    const blockerIds = new Set(
      await this.blocks.findBlockerIdsWhoBlockedUser(message.authorId),
    );
    const recipients = users.filter(
      (u) => u.id !== message.authorId && !blockerIds.has(u.id),
    );
    if (recipients.length === 0) return;

    const sender = await this.prisma.user.findUnique({
      where: { id: message.authorId },
      select: { displayName: true, username: true, interfaceLanguage: true },
    });

    const senderName = sender?.displayName ?? sender?.username ?? 'Someone';
    const locale = (sender?.interfaceLanguage as Locale) ?? 'en';
    const { title, body } = getMentionNotificationStrings(
      locale,
      senderName,
      'group',
      group.name,
    );

    const payload: PushMessagePayload = {
      title,
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data: {
        type: 'group_mention',
        groupId: group.id,
        messageId: message.id,
      },
    };

    await Promise.all(
      recipients.flatMap((user) =>
        user.pushSubscriptions.map((subscription) =>
          this.sendNotification(subscription, payload),
        ),
      ),
    );
  }

  private async sendNotification(
    subscription: {
      endpoint: string;
      p256dh: string;
      auth: string;
    },
    payload: PushMessagePayload,
  ) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await this.pushRepository
          .deleteByEndpoint(subscription.endpoint)
          .catch(() => {
            // Ignore cleanup errors.
          });
      }

      this.logger.warn(
        `Failed to send push notification to ${subscription.endpoint}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
