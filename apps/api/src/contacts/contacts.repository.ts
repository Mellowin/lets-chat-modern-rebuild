import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

interface UpsertContactInput {
  ownerUserId: string;
  contactUserId: string;
  nickname?: string | null;
}

export type ContactWithUser = Awaited<
  ReturnType<ContactsRepository['findActiveByOwnerAndContact']>
>;

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByOwnerAndContact(
    ownerUserId: string,
    contactUserId: string,
  ) {
    return this.prisma.userContact.findFirst({
      where: {
        ownerUserId,
        contactUserId,
        deletedAt: null,
      },
      include: {
        contactUser: {
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

  async listActiveByOwner(ownerUserId: string) {
    return this.prisma.userContact.findMany({
      where: {
        ownerUserId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        contactUser: {
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

  async upsertContact(input: UpsertContactInput) {
    const existing = await this.prisma.userContact.findUnique({
      where: {
        ownerUserId_contactUserId: {
          ownerUserId: input.ownerUserId,
          contactUserId: input.contactUserId,
        },
      },
    });

    if (existing) {
      return this.prisma.userContact.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          nickname: input.nickname ?? existing.nickname ?? null,
          updatedAt: new Date(),
        },
        include: {
          contactUser: {
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

    return this.prisma.userContact.create({
      data: {
        ownerUserId: input.ownerUserId,
        contactUserId: input.contactUserId,
        nickname: input.nickname ?? null,
      },
      include: {
        contactUser: {
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

  async softDeleteContact(ownerUserId: string, contactUserId: string) {
    const result = await this.prisma.userContact.updateMany({
      where: {
        ownerUserId,
        contactUserId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return result.count;
  }
}
