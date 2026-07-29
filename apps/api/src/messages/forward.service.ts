import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService, StorageBackend } from '@lets-chat/database';
import { randomUUID } from 'crypto';
import { MessagesService } from './messages.service';
import { DirectConversationsService } from '../direct-conversations/direct-conversations.service';
import { GroupsService } from '../groups/groups.service';
import { MessagesRepository } from './messages.repository';
import { DirectConversationsRepository } from '../direct-conversations/direct-conversations.repository';
import { GroupsRepository } from '../groups/groups.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { StorageService } from '../storage/storage.service';
import { BlocksService } from '../safety/blocks.service';
import {
  ForwardPermissionsHelper,
  ForwardedFromMetadata,
} from './forward-permissions.helper';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { CreateMessageAttachmentDto } from './dto/create-message-attachment.dto';
import { classifyAttachmentKind } from './messages.service';
import {
  validateAttachmentBatch,
  assertAttachmentBatchAllowed,
} from './attachment-validation';

export type ForwardableMessage = {
  id: string;
  channelId?: string;
  conversationId?: string;
  groupId?: string;
  content: string;
  createdAt: Date;
  deletedAt?: Date | null;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    storageKey: string;
    storageBackend: StorageBackend;
    deletedAt: Date | null;
  }>;
  replyToMessage?: {
    id: string;
    content: string;
    deletedAt: Date | null;
    author: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  } | null;
  forwardedFrom?: unknown;
};

const MAX_FORWARD_CONTENT_LENGTH = 4000;

@Injectable()
export class ForwardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesRepository,
    private readonly directConversations: DirectConversationsRepository,
    private readonly groups: GroupsRepository,
    private readonly channels: ChannelsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly messagesService: MessagesService,
    private readonly directConversationsService: DirectConversationsService,
    private readonly groupsService: GroupsService,
    private readonly storage: StorageService,
    private readonly blocks: BlocksService,
    private readonly forwardPermissions: ForwardPermissionsHelper,
  ) {}

  async forward(dto: ForwardMessageDto, currentUserId: string) {
    const source = await this.loadSourceMessage(
      dto.sourceType,
      dto.sourceMessageId,
    );
    if (!source || source.deletedAt != null) {
      throw new NotFoundException('Source message not found');
    }

    // Authorize the source before checking or revealing anything about the
    // destination. This prevents same-chat validation from leaking the
    // existence of an inaccessible source message.
    await this.requireSourceAccess(dto.sourceType, source, currentUserId);

    const sourceChatId = this.getSourceChatId(dto.sourceType, source);

    if (
      dto.sourceType === dto.destinationType &&
      sourceChatId === dto.destinationId
    ) {
      throw new BadRequestException(
        'Cannot forward a message to the same chat',
      );
    }

    await this.requireDestinationAccess(
      dto.destinationType,
      dto.destinationId,
      currentUserId,
    );

    const content = this.buildContent(source.content, dto.comment);
    const forwardedFrom = this.buildForwardedFrom(
      dto.sourceType,
      sourceChatId,
      source,
    );

    // Validate the complete attachment batch for channel destinations before
    // any objects are copied. Direct and group destinations keep their existing
    // limits from their own create-message paths.
    if (dto.destinationType === 'channel' && source.attachments.length > 0) {
      const batchItems = source.attachments.map((a) => ({
        mimeType: a.mimeType,
        sizeBytes: a.size,
      }));
      assertAttachmentBatchAllowed(validateAttachmentBatch(batchItems));
    }

    const { inputs: attachmentInputs, copiedKeys } =
      await this.buildAttachmentInputs(source, currentUserId);

    switch (dto.destinationType) {
      case 'channel':
        return this.forwardToChannel(
          dto.destinationId,
          content,
          attachmentInputs,
          copiedKeys,
          forwardedFrom,
          currentUserId,
        );
      case 'direct':
        return this.forwardToDirect(
          dto.destinationId,
          content,
          attachmentInputs,
          copiedKeys,
          forwardedFrom,
          currentUserId,
        );
      case 'group':
        return this.forwardToGroup(
          dto.destinationId,
          content,
          attachmentInputs,
          copiedKeys,
          forwardedFrom,
          currentUserId,
        );
      default:
        throw new BadRequestException('Invalid destination type');
    }
  }

  private async loadSourceMessage(
    sourceType: ForwardMessageDto['sourceType'],
    messageId: string,
  ): Promise<ForwardableMessage | null> {
    const message = await this.findSourceMessageRelations(
      sourceType,
      messageId,
    );
    if (!message) return null;

    const attachmentWhere =
      sourceType === 'channel'
        ? { messageId }
        : sourceType === 'direct'
          ? { directMessageId: messageId }
          : { groupMessageId: messageId };

    const attachments = await this.prisma.attachment.findMany({
      where: {
        ...attachmentWhere,
        deletedAt: null,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        storageKey: true,
        storageBackend: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    return {
      ...(message as Omit<ForwardableMessage, 'attachments'>),
      attachments: attachments,
    };
  }

  private async findSourceMessageRelations(
    sourceType: ForwardMessageDto['sourceType'],
    messageId: string,
  ) {
    switch (sourceType) {
      case 'channel':
        return this.messages.findByIdWithRelations(messageId);
      case 'direct':
        return this.directConversations.findMessageByIdWithRelations(messageId);
      case 'group':
        return this.groups.findMessageByIdWithRelations(messageId);
      default:
        return null;
    }
  }

  private async requireSourceAccess(
    sourceType: ForwardMessageDto['sourceType'],
    source: ForwardableMessage,
    userId: string,
  ) {
    const sourceChatId = this.getSourceChatId(sourceType, source);
    const canView = await this.forwardPermissions.canViewSource(
      userId,
      sourceType,
      sourceChatId,
    );
    if (!canView) {
      throw new NotFoundException('Source message not found');
    }
  }

  private async requireDestinationAccess(
    destinationType: ForwardMessageDto['destinationType'],
    destinationId: string,
    userId: string,
  ) {
    switch (destinationType) {
      case 'channel': {
        const channel = await this.channels.findActiveById(destinationId);
        if (!channel) {
          throw new NotFoundException('Destination channel not found');
        }
        const wsRole = await this.workspaces.findMemberRole(
          channel.workspaceId,
          userId,
        );
        if (!wsRole) {
          throw new NotFoundException('Destination channel not found');
        }
        const chRole = await this.channels.findChannelMemberRole(
          destinationId,
          userId,
        );
        if (!chRole) {
          throw new NotFoundException('Destination channel not found');
        }
        return;
      }
      case 'direct': {
        const participant = await this.directConversations.findParticipant(
          destinationId,
          userId,
        );
        if (!participant) {
          throw new ForbiddenException('Access denied');
        }

        const participants =
          await this.directConversations.findParticipants(destinationId);
        const otherParticipant = participants.find((p) => p.userId !== userId);
        if (otherParticipant) {
          await this.blocks.requireNoBlockInEitherDirection(
            userId,
            otherParticipant.userId,
            'Cannot forward messages to this user',
          );
        }
        return;
      }
      case 'group': {
        const member = await this.groups.findActiveMember(
          destinationId,
          userId,
        );
        if (!member) {
          throw new NotFoundException('Destination group not found');
        }
        return;
      }
      default:
        throw new BadRequestException('Invalid destination type');
    }
  }

  private getSourceChatId(
    sourceType: ForwardMessageDto['sourceType'],
    source: ForwardableMessage,
  ): string {
    switch (sourceType) {
      case 'channel':
        return source.channelId ?? '';
      case 'direct':
        return source.conversationId ?? '';
      case 'group':
        return source.groupId ?? '';
      default:
        return '';
    }
  }

  private buildForwardedFrom(
    sourceType: ForwardMessageDto['sourceType'],
    sourceChatId: string,
    source: ForwardableMessage,
  ): Prisma.InputJsonValue {
    // Always attribute the forwarded copy to the immediate source message.
    // Re-forwarding a forward previously kept the root attribution while copying
    // the intermediate message's full content (including intermediate comments
    // or edits), which mis-attributed that content to the original author.
    const replySnapshot = source.replyToMessage
      ? {
          id: source.replyToMessage.id,
          content: source.replyToMessage.deletedAt
            ? null
            : source.replyToMessage.content,
          authorName:
            source.replyToMessage.author.displayName ??
            source.replyToMessage.author.username,
        }
      : undefined;

    const metadata: ForwardedFromMetadata = {
      sourceType,
      sourceMessageId: source.id,
      sourceChatId,
      originalAuthorId: source.author.id,
      originalAuthorName: source.author.displayName ?? source.author.username,
      originalCreatedAt: source.createdAt.toISOString(),
      ...(replySnapshot && { replySnapshot }),
    };

    return metadata as unknown as Prisma.InputJsonValue;
  }

  private buildContent(sourceContent: string, comment?: string): string {
    const trimmedComment = comment?.trim();
    let content: string;
    if (!trimmedComment) {
      content = sourceContent;
    } else if (!sourceContent) {
      content = trimmedComment;
    } else {
      content = `${trimmedComment}\n\n${sourceContent}`;
    }

    if (content.length > MAX_FORWARD_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Forwarded content must be at most ${MAX_FORWARD_CONTENT_LENGTH} characters`,
      );
    }

    return content;
  }

  private async buildAttachmentInputs(
    source: ForwardableMessage,
    forwarderId: string,
  ): Promise<{
    inputs: CreateMessageAttachmentDto[];
    copiedKeys: string[];
  }> {
    if (source.attachments.length === 0) return { inputs: [], copiedKeys: [] };

    const copiedKeys: string[] = [];
    const inputs: CreateMessageAttachmentDto[] = [];

    try {
      for (const a of source.attachments) {
        const destinationKey = `forwarded/${forwarderId}/${randomUUID()}/${a.filename}`;
        await this.storage.copyObject(a.storageKey, destinationKey);
        copiedKeys.push(destinationKey);
        inputs.push({
          storageKey: destinationKey,
          fileName: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.size,
          kind: classifyAttachmentKind(a.mimeType),
        });
      }
      return { inputs, copiedKeys };
    } catch (err) {
      await this.deleteCopiedObjects(copiedKeys);
      throw err;
    }
  }

  private async deleteCopiedObjects(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map((key) => this.storage.deleteObject(key).catch(() => {})),
    );
  }

  private async forwardToChannel(
    channelId: string,
    content: string,
    attachments: CreateMessageAttachmentDto[],
    copiedKeys: string[],
    forwardedFrom: Prisma.InputJsonValue,
    userId: string,
  ) {
    const channel = await this.channels.findActiveById(channelId);
    if (!channel) {
      await this.cleanupAfterFailure([], copiedKeys);
      throw new NotFoundException('Destination channel not found');
    }

    try {
      return await this.messagesService.create(
        channel.workspaceId,
        channelId,
        {
          content,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
        userId,
        forwardedFrom,
      );
    } catch (err) {
      await this.cleanupAfterFailure([], copiedKeys);
      throw err;
    }
  }

  private async forwardToDirect(
    conversationId: string,
    content: string,
    attachments: CreateMessageAttachmentDto[],
    copiedKeys: string[],
    forwardedFrom: Prisma.InputJsonValue,
    userId: string,
  ) {
    let attachmentRecords: Array<{ id: string; storageKey: string }> = [];

    try {
      if (attachments.length > 0) {
        attachmentRecords = await this.createUnattachedAttachmentRecords(
          attachments,
          userId,
        );
      }

      return await this.directConversationsService.createMessage(
        conversationId,
        {
          content,
          attachmentIds:
            attachmentRecords.length > 0
              ? attachmentRecords.map((r) => r.id)
              : undefined,
        },
        userId,
        forwardedFrom,
      );
    } catch (err) {
      await this.cleanupAfterFailure(
        attachmentRecords.map((r) => r.id),
        copiedKeys,
      );
      throw err;
    }
  }

  private async forwardToGroup(
    groupId: string,
    content: string,
    attachments: CreateMessageAttachmentDto[],
    copiedKeys: string[],
    forwardedFrom: Prisma.InputJsonValue,
    userId: string,
  ) {
    let attachmentRecords: Array<{ id: string; storageKey: string }> = [];

    try {
      if (attachments.length > 0) {
        attachmentRecords = await this.createUnattachedAttachmentRecords(
          attachments,
          userId,
        );
      }

      return await this.groupsService.createMessage(
        groupId,
        {
          content,
          attachmentIds:
            attachmentRecords.length > 0
              ? attachmentRecords.map((r) => r.id)
              : undefined,
        },
        userId,
        forwardedFrom,
      );
    } catch (err) {
      await this.cleanupAfterFailure(
        attachmentRecords.map((r) => r.id),
        copiedKeys,
      );
      throw err;
    }
  }

  private async createUnattachedAttachmentRecords(
    attachments: CreateMessageAttachmentDto[],
    createdById: string,
  ): Promise<Array<{ id: string; storageKey: string }>> {
    const created = await this.prisma.$transaction(
      attachments.map((a) =>
        this.prisma.attachment.create({
          data: {
            createdById,
            filename: a.fileName,
            originalName: a.fileName,
            mimeType: a.mimeType,
            size: a.sizeBytes,
            storageKey: a.storageKey,
            storageBackend: StorageBackend.MINIO,
          },
          select: { id: true, storageKey: true },
        }),
      ),
    );
    return created.map((a) => ({ id: a.id, storageKey: a.storageKey }));
  }

  private async cleanupAfterFailure(
    createdAttachmentIds: string[],
    copiedKeys: string[],
  ): Promise<void> {
    if (createdAttachmentIds.length > 0) {
      await this.prisma.attachment
        .deleteMany({
          where: {
            id: { in: createdAttachmentIds },
            messageId: null,
            directMessageId: null,
            groupMessageId: null,
          },
        })
        .catch(() => {});
    }

    for (const key of copiedKeys) {
      try {
        const stillReferenced = await this.prisma.attachment.count({
          where: { storageKey: key },
        });
        if (stillReferenced === 0) {
          await this.storage.deleteObject(key).catch(() => {});
        }
      } catch {
        // If we cannot verify references, preserve the object rather than
        // risk deleting one that is still in use.
      }
    }
  }
}
