import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Prisma } from '@lets-chat/database';
import { ChannelsService } from '../channels/channels.service';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { SearchGlobalMessagesQueryDto } from './dto/search-global-messages-query.dto';

export interface SearchResult {
  id: string;
  content: string;
  contentSnippet: string;
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
  isPinned: boolean;
  forwardedFrom: unknown;
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
  channelType: 'PUBLIC' | 'PRIVATE';
}

export interface GlobalSearchDirectSource {
  type: 'DIRECT';
  conversationId: string;
  otherParticipant: GlobalSearchAuthor | null;
}

export interface GlobalSearchGroupSource {
  type: 'GROUP';
  groupId: string;
  groupName: string;
}

export type GlobalSearchSource =
  | GlobalSearchChannelSource
  | GlobalSearchDirectSource
  | GlobalSearchGroupSource;

export interface GlobalSearchResult {
  id: string;
  content: string;
  contentSnippet: string;
  createdAt: Date;
  author: GlobalSearchAuthor;
  source: GlobalSearchSource;
  isPinned: boolean;
  forwardedFrom: unknown;
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
        LEFT(m.content, 300) AS "contentSnippet",
        m."createdAt",
        m."forwardedFrom" AS "forwardedFrom",
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
        ) as channel,
        EXISTS (
          SELECT 1 FROM "PinnedChannelMessage" pcm
          WHERE pcm."messageId" = m.id
        ) AS "isPinned"
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      JOIN "Channel" c ON c.id = m."channelId"
      JOIN "Workspace" w ON w.id = c."workspaceId"
      WHERE m."searchVector" @@ plainto_tsquery('simple', ${q})
        AND m."deletedAt" IS NULL
        AND c."workspaceId" = ${workspaceId}::uuid
        AND c."deletedAt" IS NULL
        AND c."permanentlyDeletedAt" IS NULL
        AND w."deletedAt" IS NULL
        AND w."permanentlyDeletedAt" IS NULL
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
    // Context filters implicitly narrow the search scope so results are not
    // polluted by unrelated conversation types.
    const hasChannelFilter = !!query.channelId || !!query.workspaceId;
    const hasDirectFilter = !!query.conversationId;
    const hasGroupFilter = !!query.groupId;
    const scope = hasGroupFilter
      ? 'group'
      : hasDirectFilter
        ? 'direct'
        : hasChannelFilter
          ? 'channel'
          : (query.scope ?? 'all');
    const includeChannel = scope === 'all' || scope === 'channel';
    const includeDirect = scope === 'all' || scope === 'direct';
    const includeGroup = scope === 'all' || scope === 'group';

    const workspaceId = query.workspaceId ?? null;
    const channelId = query.channelId ?? null;
    const conversationId = query.conversationId ?? null;
    const groupId = query.groupId ?? null;

    const cursor = query.cursor ? await this.resolveCursor(query.cursor) : null;
    const tsQuery = Prisma.sql`plainto_tsquery('simple', ${query.q})`;

    const cursorClause = cursor
      ? Prisma.sql`
          AND (
            m."createdAt" < ${cursor.createdAt}::timestamptz
            OR (
              m."createdAt" = ${cursor.createdAt}::timestamptz
              AND m.id < ${cursor.id}::uuid
            )
          )`
      : Prisma.sql``;
    const dmCursorClause = cursor
      ? Prisma.sql`
          AND (
            dm."createdAt" < ${cursor.createdAt}::timestamptz
            OR (
              dm."createdAt" = ${cursor.createdAt}::timestamptz
              AND dm.id < ${cursor.id}::uuid
            )
          )`
      : Prisma.sql``;
    const gmCursorClause = cursor
      ? Prisma.sql`
          AND (
            gm."createdAt" < ${cursor.createdAt}::timestamptz
            OR (
              gm."createdAt" = ${cursor.createdAt}::timestamptz
              AND gm.id < ${cursor.id}::uuid
            )
          )`
      : Prisma.sql``;

    const channelScopeClause = includeChannel
      ? Prisma.sql``
      : Prisma.sql`AND FALSE`;
    const directScopeClause = includeDirect
      ? Prisma.sql``
      : Prisma.sql`AND FALSE`;
    const groupScopeClause = includeGroup
      ? Prisma.sql``
      : Prisma.sql`AND FALSE`;

    const rows = await this.prisma.$queryRaw<GlobalSearchResult[]>(Prisma.sql`
      WITH accessible_channels AS (
        SELECT
          c.id AS channel_id,
          c."workspaceId",
          c.name,
          c.slug,
          c.type AS channel_type,
          w.name AS workspace_name
        FROM "Channel" c
        JOIN "Workspace" w ON w.id = c."workspaceId"
        JOIN "WorkspaceMember" wm
          ON wm."workspaceId" = w.id
          AND wm."userId" = ${userId}::uuid
          AND wm."deletedAt" IS NULL
        WHERE c."deletedAt" IS NULL
          AND c."permanentlyDeletedAt" IS NULL
          AND w."deletedAt" IS NULL
          AND w."permanentlyDeletedAt" IS NULL
          AND (
            c.type = 'PUBLIC'
            OR EXISTS (
              SELECT 1 FROM "ChannelMember" cm
              WHERE cm."channelId" = c.id
                AND cm."userId" = ${userId}::uuid
                AND cm."deletedAt" IS NULL
            )
          )
          AND (${workspaceId}::uuid IS NULL OR w.id = ${workspaceId}::uuid)
          AND (${channelId}::uuid IS NULL OR c.id = ${channelId}::uuid)
      ),
      accessible_conversations AS (
        SELECT dc.id AS conversation_id
        FROM "DirectConversation" dc
        JOIN "DirectConversationParticipant" dcp
          ON dcp."conversationId" = dc.id
          AND dcp."userId" = ${userId}::uuid
        WHERE (${conversationId}::uuid IS NULL OR dc.id = ${conversationId}::uuid)
      ),
      accessible_groups AS (
        SELECT g.id AS group_id, g.name AS group_name
        FROM "GroupConversation" g
        JOIN "GroupMember" gm
          ON gm."groupId" = g.id
          AND gm."userId" = ${userId}::uuid
          AND gm."leftAt" IS NULL
        WHERE g."archivedAt" IS NULL
          AND (${groupId}::uuid IS NULL OR g.id = ${groupId}::uuid)
      ),
      blocked_users AS (
        SELECT "blockedId" AS id FROM "UserBlock" WHERE "blockerId" = ${userId}::uuid AND "deletedAt" IS NULL
        UNION
        SELECT "blockerId" AS id FROM "UserBlock" WHERE "blockedId" = ${userId}::uuid AND "deletedAt" IS NULL
      )
      SELECT
        m.id,
        m.content,
        LEFT(m.content, 300) AS "contentSnippet",
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
          'channelSlug', ac.slug,
          'channelType', ac.channel_type
        ) AS source,
        EXISTS (
          SELECT 1 FROM "PinnedChannelMessage" pcm
          WHERE pcm."messageId" = m.id
        ) AS "isPinned"
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      JOIN accessible_channels ac ON ac.channel_id = m."channelId"
      WHERE m."deletedAt" IS NULL
        AND m."searchVector" @@ ${tsQuery}
        ${channelScopeClause}
        ${cursorClause}
      UNION ALL
      SELECT
        dm.id,
        dm.content,
        LEFT(dm.content, 300) AS "contentSnippet",
        dm."createdAt",
        dm."forwardedFrom" AS "forwardedFrom",
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
        ) AS source,
        EXISTS (
          SELECT 1 FROM "PinnedDirectMessage" pdm
          WHERE pdm."messageId" = dm.id
        ) AS "isPinned"
      FROM "DirectMessage" dm
      JOIN "User" u ON u.id = dm."authorId"
      JOIN accessible_conversations aconv ON aconv.conversation_id = dm."conversationId"
      WHERE dm."deletedAt" IS NULL
        AND dm."searchVector" @@ ${tsQuery}
        ${directScopeClause}
        ${dmCursorClause}
        AND u.id NOT IN (SELECT id FROM blocked_users)
        AND NOT EXISTS (
          SELECT 1 FROM "DirectConversationParticipant" dcp3
          WHERE dcp3."conversationId" = dm."conversationId"
            AND dcp3."userId" != ${userId}::uuid
            AND dcp3."userId" IN (SELECT id FROM blocked_users)
        )
      UNION ALL
      SELECT
        gm.id,
        gm.content,
        LEFT(gm.content, 300) AS "contentSnippet",
        gm."createdAt",
        gm."forwardedFrom" AS "forwardedFrom",
        jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'displayName', u."displayName",
          'avatarUrl', u."avatarUrl"
        ) AS author,
        'GROUP'::text AS "sourceType",
        jsonb_build_object(
          'type', 'GROUP',
          'groupId', ag.group_id,
          'groupName', ag.group_name
        ) AS source,
        EXISTS (
          SELECT 1 FROM "PinnedGroupMessage" pgm
          WHERE pgm."messageId" = gm.id
        ) AS "isPinned"
      FROM "GroupMessage" gm
      JOIN "User" u ON u.id = gm."authorId"
      JOIN accessible_groups ag ON ag.group_id = gm."groupId"
      WHERE gm."searchVector" @@ ${tsQuery}
        ${groupScopeClause}
        ${gmCursorClause}
        AND u.id NOT IN (SELECT id FROM blocked_users)
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor };
  }

  private async resolveCursor(
    cursorId: string,
  ): Promise<{ createdAt: Date; id: string } | null> {
    const [message, directMessage, groupMessage] = await Promise.all([
      this.prisma.message.findUnique({
        where: { id: cursorId },
        select: { createdAt: true },
      }),
      this.prisma.directMessage.findUnique({
        where: { id: cursorId },
        select: { createdAt: true },
      }),
      this.prisma.groupMessage.findUnique({
        where: { id: cursorId },
        select: { createdAt: true },
      }),
    ]);

    const found = message ?? directMessage ?? groupMessage;
    return found ? { createdAt: found.createdAt, id: cursorId } : null;
  }
}
