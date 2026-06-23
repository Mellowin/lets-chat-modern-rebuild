import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lets-chat/database';
import * as webpush from 'web-push';
import { PushRepository } from './push.repository';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

const NOTIFICATION_ICON = '/icon.svg';
const NOTIFICATION_BADGE = '/icon.svg';
const MAX_BODY_LENGTH = 120;

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
        select: { displayName: true, username: true },
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
          include: { pushSubscriptions: true },
        },
      },
    });

    if (members.length === 0) return;

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
      members.flatMap((member) =>
        member.user.pushSubscriptions.map((subscription) =>
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
              include: { pushSubscriptions: true },
            },
          },
        },
      },
    });

    if (!conversation || conversation.participants.length === 0) return;

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
      conversation.participants.flatMap((participant) =>
        participant.user.pushSubscriptions.map((subscription) =>
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
