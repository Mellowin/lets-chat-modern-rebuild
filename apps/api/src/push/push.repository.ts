import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

@Injectable()
export class PushRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSubscription(userId: string, input: PushSubscriptionInput) {
    return this.prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint: input.endpoint,
        },
      },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async deleteSubscription(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });
  }

  async findByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.prisma.pushSubscription.findMany({
      where: {
        userId: { in: userIds },
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
    });
  }

  async deleteByEndpoint(endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });
  }
}
