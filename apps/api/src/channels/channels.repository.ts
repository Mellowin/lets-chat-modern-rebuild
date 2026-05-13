import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

interface CreateChannelInput {
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  type: 'PUBLIC' | 'PRIVATE';
  createdById: string;
}

@Injectable()
export class ChannelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createChannel(data: CreateChannelInput, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          type: data.type,
          createdById: data.createdById,
        },
      });
      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId,
          role: 'OWNER',
        },
      });
      return channel;
    });
  }

  async findBySlug(workspaceId: string, slug: string) {
    return this.prisma.channel.findFirst({
      where: {
        workspaceId,
        slug,
        deletedAt: null,
      },
    });
  }

  async listForWorkspace(workspaceId: string, userId: string) {
    return this.prisma.channel.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          { type: 'PUBLIC' },
          {
            type: 'PRIVATE',
            members: {
              some: {
                userId,
                deletedAt: null,
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
