import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { ChannelsService } from '../channels/channels.service';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';

export interface SearchResult {
  id: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  channel: {
    id: string;
    name: string;
    slug: string;
  };
}

@Injectable()
export class MessagesSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async search(
    workspaceId: string,
    userId: string,
    query: SearchMessagesQueryDto,
  ) {
    if (query.channelId) {
      await this.channels.findById(workspaceId, query.channelId, userId);
    } else {
      const wsRole = await this.workspaces.findMemberRole(workspaceId, userId);
      if (!wsRole) {
        throw new NotFoundException('Workspace not found');
      }
    }

    const limit = Math.min(query.limit ?? 20, 50);
    const q = query.q;
    const channelId = query.channelId ?? null;

    return this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        m.id,
        m.content,
        m."createdAt",
        jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'displayName', u."displayName",
          'avatarUrl', u."avatarUrl"
        ) as author,
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'slug', c.slug
        ) as channel
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      JOIN "Channel" c ON c.id = m."channelId"
      WHERE m."searchVector" @@ plainto_tsquery('simple', ${q})
        AND m."deletedAt" IS NULL
        AND c."workspaceId" = ${workspaceId}::uuid
        AND c."deletedAt" IS NULL
        AND (
          c.type = 'PUBLIC'
          OR EXISTS (
            SELECT 1 FROM "ChannelMember" cm
            WHERE cm."channelId" = c.id
              AND cm."userId" = ${userId}::uuid
              AND cm."deletedAt" IS NULL
          )
        )
        AND (${channelId}::uuid IS NULL OR c.id = ${channelId}::uuid)
      ORDER BY ts_rank(m."searchVector", plainto_tsquery('simple', ${q})) DESC,
               m."createdAt" DESC
      LIMIT ${limit}
    `;
  }
}
