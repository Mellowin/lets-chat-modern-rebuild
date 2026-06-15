import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Prisma } from '@lets-chat/database';
import { ChannelsService } from '../channels/channels.service';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { SearchGlobalMessagesQueryDto } from './dto/search-global-messages-query.dto';

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

export interface GlobalSearchAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface GlobalSearchChannelSource {
  type: 'CHANNEL';
  workspaceId: string;
  workspaceName: string;
  channelId: string;
  channelName: string;
  channelSlug: string;
}

export interface GlobalSearchDirectSource {
  type: 'DIRECT';
  conversationId: string;
  otherParticipant: GlobalSearchAuthor | null;
}

export type GlobalSearchSource =
  | GlobalSearchChannelSource
  | GlobalSearchDirectSource;

export interface GlobalSearchResult {
  id: string;
  content: string;
  createdAt: Date;
  author: GlobalSearchAuthor;
  source: GlobalSearchSource;
}

export interface GlobalSearchResponse {
  items: GlobalSearchResult[];
  nextCursor: string | null;
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

  async searchGlobal(
    userId: string,
    query: SearchGlobalMessagesQueryDto,
  ): Promise<GlobalSearchResponse> {
    const limit = Math.min(query.limit ?? 20, 50);
    const pattern = `%${query.q}%`;
    const cursorCreatedAt = query.cursor
      ? await this.resolveCursorCreatedAt(query.cursor)
      : null;

    const cursorClause = cursorCreatedAt
      ? Prisma.sql`AND m."createdAt" < ${cursorCreatedAt}::timestamptz`
      : Prisma.sql``;
    const dmCursorClause = cursorCreatedAt
      ? Prisma.sql`AND dm."createdAt" < ${cursorCreatedAt}::timestamptz`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<GlobalSearchResult[]>(Prisma.sql`
      WITH accessible_channels AS (
        SELECT
          c.id AS channel_id,
          c."workspaceId",
          c.name,
          c.slug,
          w.name AS workspace_name
        FROM "Channel" c
        JOIN "Workspace" w ON w.id = c."workspaceId"
        JOIN "WorkspaceMember" wm
          ON wm."workspaceId" = w.id
          AND wm."userId" = ${userId}::uuid
          AND wm."deletedAt" IS NULL
        WHERE c."deletedAt" IS NULL
          AND (
            c.type = 'PUBLIC'
            OR EXISTS (
              SELECT 1 FROM "ChannelMember" cm
              WHERE cm."channelId" = c.id
                AND cm."userId" = ${userId}::uuid
                AND cm."deletedAt" IS NULL
            )
          )
      ),
      accessible_conversations AS (
        SELECT dc.id AS conversation_id
        FROM "DirectConversation" dc
        JOIN "DirectConversationParticipant" dcp
          ON dcp."conversationId" = dc.id
          AND dcp."userId" = ${userId}::uuid
      )
      SELECT
        m.id,
        m.content,
        m."createdAt",
        jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'displayName', u."displayName",
          'avatarUrl', u."avatarUrl"
        ) AS author,
        'CHANNEL'::text AS "sourceType",
        jsonb_build_object(
          'type', 'CHANNEL',
          'workspaceId', ac."workspaceId",
          'workspaceName', ac.workspace_name,
          'channelId', ac.channel_id,
          'channelName', ac.name,
          'channelSlug', ac.slug
        ) AS source
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      JOIN accessible_channels ac ON ac.channel_id = m."channelId"
      WHERE m."deletedAt" IS NULL
        AND m.content ILIKE ${pattern}
        ${cursorClause}
      UNION ALL
      SELECT
        dm.id,
        dm.content,
        dm."createdAt",
        jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'displayName', u."displayName",
          'avatarUrl', u."avatarUrl"
        ) AS author,
        'DIRECT'::text AS "sourceType",
        jsonb_build_object(
          'type', 'DIRECT',
          'conversationId', dm."conversationId",
          'otherParticipant', (
            SELECT jsonb_build_object(
              'id', ou.id,
              'username', ou.username,
              'displayName', ou."displayName",
              'avatarUrl', ou."avatarUrl"
            )
            FROM "DirectConversationParticipant" dcp2
            JOIN "User" ou ON ou.id = dcp2."userId"
            WHERE dcp2."conversationId" = dm."conversationId"
              AND dcp2."userId" != ${userId}::uuid
            LIMIT 1
          )
        ) AS source
      FROM "DirectMessage" dm
      JOIN "User" u ON u.id = dm."authorId"
      JOIN accessible_conversations aconv ON aconv.conversation_id = dm."conversationId"
      WHERE dm."deletedAt" IS NULL
        AND dm.content ILIKE ${pattern}
        ${dmCursorClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor };
  }

  private async resolveCursorCreatedAt(cursorId: string): Promise<Date | null> {
    const [message, directMessage] = await Promise.all([
      this.prisma.message.findUnique({
        where: { id: cursorId },
        select: { createdAt: true },
      }),
      this.prisma.directMessage.findUnique({
        where: { id: cursorId },
        select: { createdAt: true },
      }),
    ]);

    return message?.createdAt ?? directMessage?.createdAt ?? null;
  }
}
