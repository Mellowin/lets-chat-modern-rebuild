import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

export type ContactRequestWithFromUser = Awaited<
  ReturnType<ContactRequestsRepository['findPendingByIdForRecipient']>
>;

@Injectable()
export class ContactRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBetweenUsers(fromUserId: string, toUserId: string) {
    return this.prisma.contactRequest.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
    });
  }

  async findPendingByIdForRecipient(id: string, toUserId: string) {
    return this.prisma.contactRequest.findFirst({
      where: { id, toUserId, status: 'PENDING' },
      include: {
        fromUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async listPendingForRecipient(toUserId: string) {
    return this.prisma.contactRequest.findMany({
      where: { toUserId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        fromUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async upsertPending(fromUserId: string, toUserId: string) {
    return this.prisma.contactRequest.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      create: { fromUserId, toUserId, status: 'PENDING' },
      update: {
        status: 'PENDING',
        declinedAt: null,
        updatedAt: new Date(),
      },
    });
  }

  async updateStatus(
    id: string,
    status: 'ACCEPTED' | 'DECLINED',
    declinedAt: Date | null = null,
  ) {
    return this.prisma.contactRequest.update({
      where: { id },
      data: { status, declinedAt, updatedAt: new Date() },
    });
  }

  async deleteById(id: string) {
    return this.prisma.contactRequest.delete({ where: { id } });
  }

  async findPendingByIdForSender(id: string, fromUserId: string) {
    return this.prisma.contactRequest.findFirst({
      where: { id, fromUserId, status: 'PENDING' },
    });
  }
}
