import { Injectable } from '@nestjs/common';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { DirectConversationsRepository } from '../direct-conversations/direct-conversations.repository';
import { GroupsRepository } from '../groups/groups.repository';

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

@Injectable()
export class ForwardPermissionsHelper {
  constructor(
    private readonly channels: ChannelsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly directConversations: DirectConversationsRepository,
    private readonly groups: GroupsRepository,
  ) {}

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

  private async canViewChannelSource(
    userId: string,
    channelId: string,
  ): Promise<boolean> {
    const channel = await this.channels.findActiveById(channelId);
    if (!channel) return false;

    const wsRole = await this.workspaces.findMemberRole(
      channel.workspaceId,
      userId,
    );
    if (!wsRole) return false;

    if (channel.type === 'PRIVATE') {
      const chRole = await this.channels.findChannelMemberRole(channelId, userId);
      if (!chRole) return false;
    }

    return true;
  }

  private async canViewDirectSource(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    return !!participant;
  }

  private async canViewGroupSource(
    userId: string,
    groupId: string,
  ): Promise<boolean> {
    const member = await this.groups.findActiveMember(groupId, userId);
    return !!member;
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

    const canView = await this.canViewSource(
      userId,
      sourceType,
      sourceChatId,
    );

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
