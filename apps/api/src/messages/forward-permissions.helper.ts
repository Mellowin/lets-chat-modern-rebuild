import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

export interface ForwardedFromMetadata {
  sourceType: 'channel' | 'direct' | 'group';
  sourceMessageId: string;
  sourceChatId: string;
  originalAuthorId?: string;
  originalAuthorName?: string;
  originalCreatedAt: string;
  replySnapshot?: {
    id: string;
    content: string | null;
    authorName: string;
  };
}

export interface ForwardedFromResponse extends ForwardedFromMetadata {
  isAnonymous?: false;
}

export interface ForwardedFromAnonymous {
  sourceType: 'channel' | 'direct' | 'group';
  originalCreatedAt: string;
  isAnonymous: true;
}

export type ForwardedFromPayload =
  | ForwardedFromResponse
  | ForwardedFromAnonymous;

export type ForwardSourceKey = {
  sourceType: 'channel' | 'direct' | 'group';
  sourceChatId: string;
};

@Injectable()
export class ForwardPermissionsHelper {
  constructor(private readonly prisma: PrismaService) {}

  async canViewSource(
    userId: string,
    sourceType: 'channel' | 'direct' | 'group',
    sourceChatId: string,
  ): Promise<boolean> {
    switch (sourceType) {
      case 'channel':
        return this.canViewChannelSource(userId, sourceChatId);
      case 'direct':
        return this.canViewDirectSource(userId, sourceChatId);
      case 'group':
        return this.canViewGroupSource(userId, sourceChatId);
      default:
        return false;
    }
  }

  async canViewSources(
    userId: string,
    sources: ForwardSourceKey[],
  ): Promise<Set<string>> {
    const channelIds = unique(
      sources
        .filter((s) => s.sourceType === 'channel')
        .map((s) => s.sourceChatId),
    );
    const directIds = unique(
      sources
        .filter((s) => s.sourceType === 'direct')
        .map((s) => s.sourceChatId),
    );
    const groupIds = unique(
      sources
        .filter((s) => s.sourceType === 'group')
        .map((s) => s.sourceChatId),
    );

    const [channelAccessible, directAccessible, groupAccessible] =
      await Promise.all([
        this.canViewChannelSources(userId, channelIds),
        this.canViewDirectSources(userId, directIds),
        this.canViewGroupSources(userId, groupIds),
      ]);

    const accessible = new Set<string>();
    channelAccessible.forEach((id) => accessible.add(`channel:${id}`));
    directAccessible.forEach((id) => accessible.add(`direct:${id}`));
    groupAccessible.forEach((id) => accessible.add(`group:${id}`));
    return accessible;
  }

  private async canViewChannelSource(
    userId: string,
    channelId: string,
  ): Promise<boolean> {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        deletedAt: null,
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
      },
      select: { id: true, type: true, workspaceId: true },
    });
    if (!channel) return false;

    const wsMember = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId: channel.workspaceId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!wsMember) return false;

    const chMember = await this.prisma.channelMember.findFirst({
      where: { channelId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!chMember) return false;

    return true;
  }

  private async canViewChannelSources(
    userId: string,
    channelIds: string[],
  ): Promise<string[]> {
    if (channelIds.length === 0) return [];

    const channels = await this.prisma.channel.findMany({
      where: {
        id: { in: channelIds },
        deletedAt: null,
        permanentlyDeletedAt: null,
        workspace: { permanentlyDeletedAt: null },
      },
      select: { id: true, type: true, workspaceId: true },
    });

    const workspaceIds = unique(channels.map((c) => c.workspaceId));

    const [memberWorkspaceRows, memberChannelRows] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: {
          userId,
          deletedAt: null,
          workspaceId: { in: workspaceIds },
        },
        select: { workspaceId: true },
      }),
      this.prisma.channelMember.findMany({
        where: {
          userId,
          deletedAt: null,
          channelId: { in: channels.map((c) => c.id) },
        },
        select: { channelId: true },
      }),
    ]);

    const memberWorkspaces = new Set(
      memberWorkspaceRows.map((r) => r.workspaceId),
    );
    const memberChannels = new Set(memberChannelRows.map((r) => r.channelId));

    return channels
      .filter(
        (c) => memberWorkspaces.has(c.workspaceId) && memberChannels.has(c.id),
      )
      .map((c) => c.id);
  }

  private async canViewDirectSource(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const participant =
      await this.prisma.directConversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });
    return !!participant;
  }

  private async canViewDirectSources(
    userId: string,
    conversationIds: string[],
  ): Promise<string[]> {
    if (conversationIds.length === 0) return [];

    const participants =
      await this.prisma.directConversationParticipant.findMany({
        where: {
          userId,
          conversationId: { in: conversationIds },
        },
        select: { conversationId: true },
      });

    return participants.map((p) => p.conversationId);
  }

  private async canViewGroupSource(
    userId: string,
    groupId: string,
  ): Promise<boolean> {
    const member = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        leftAt: null,
        group: {
          archivedAt: null,
        },
      },
    });
    return !!member;
  }

  private async canViewGroupSources(
    userId: string,
    groupIds: string[],
  ): Promise<string[]> {
    if (groupIds.length === 0) return [];

    const members = await this.prisma.groupMember.findMany({
      where: {
        userId,
        groupId: { in: groupIds },
        leftAt: null,
        group: {
          archivedAt: null,
        },
      },
      select: { groupId: true },
    });

    return members.map((m) => m.groupId);
  }

  async toResponse(
    forwardedFrom: unknown,
    userId: string,
  ): Promise<ForwardedFromPayload | undefined> {
    if (!forwardedFrom || typeof forwardedFrom !== 'object') return undefined;

    const meta = forwardedFrom as Partial<ForwardedFromMetadata>;
    const sourceType = meta.sourceType;
    const sourceChatId = meta.sourceChatId;
    const originalCreatedAt = meta.originalCreatedAt;

    if (
      !sourceType ||
      !['channel', 'direct', 'group'].includes(sourceType) ||
      !sourceChatId ||
      !originalCreatedAt
    ) {
      return undefined;
    }

    const canView = await this.canViewSource(userId, sourceType, sourceChatId);

    if (canView) {
      return {
        sourceType,
        sourceMessageId: meta.sourceMessageId ?? '',
        sourceChatId,
        originalAuthorId: meta.originalAuthorId,
        originalAuthorName: meta.originalAuthorName,
        originalCreatedAt,
        replySnapshot: meta.replySnapshot,
      };
    }

    return {
      sourceType,
      originalCreatedAt,
      isAnonymous: true,
    };
  }

  maskResponse(
    forwardedFrom: ForwardedFromPayload | undefined,
  ): ForwardedFromPayload | undefined {
    if (!forwardedFrom) return undefined;
    return {
      sourceType: forwardedFrom.sourceType,
      originalCreatedAt: forwardedFrom.originalCreatedAt,
      isAnonymous: true,
    };
  }
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
