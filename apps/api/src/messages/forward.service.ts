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
import {
  ForwardPermissionsHelper,
  ForwardedFromMetadata,
} from './forward-permissions.helper';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { CreateMessageAttachmentDto } from './dto/create-message-attachment.dto';
import { classifyAttachmentKind } from './messages.service';

export type ForwardableMessage = {
  id: string;
  channelId?: string;
  conversationId?: string;
  groupId?: string;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
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
    private readonly forwardPermissions: ForwardPermissionsHelper,
  ) {}

  async forward(dto: ForwardMessageDto, currentUserId: string) {
    if (dto.sourceType === dto.destinationType && dto.sourceMessageId === dto.destinationId) {
      throw new BadRequestException('Cannot forward a message to itself');
    }

    const source = await this.loadSourceMessage(
      dto.sourceType,
      dto.sourceMessageId,
    );
    if (!source || source.deletedAt !== null) {
      throw new NotFoundException('Source message not found');
    }

    await this.requireSourceAccess(dto.sourceType, source, currentUserId);
    await this.requireDestinationAccess(
      dto.destinationType,
      dto.destinationId,
      currentUserId,
    );

    const sourceChatId = this.getSourceChatId(dto.sourceType, source);
    const forwardedFrom = this.buildForwardedFrom(
      dto.sourceType,
      sourceChatId,
      source,
    );
    const content = this.buildContent(source.content, dto.comment);
    const attachmentInputs = await this.buildAttachmentInputs(
      source,
      currentUserId,
    );

    switch (dto.destinationType) {
      case 'channel':
        return this.forwardToChannel(
          dto.destinationId,
          content,
          attachmentInputs,
          forwardedFrom,
          currentUserId,
        );
      case 'direct':
        return this.forwardToDirect(
          dto.destinationId,
          content,
          attachmentInputs,
          forwardedFrom,
          currentUserId,
        );
      case 'group':
        return this.forwardToGroup(
          dto.destinationId,
          content,
          attachmentInputs,
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
      attachments: attachments as ForwardableMessage['attachments'],
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
        return;
      }
      case 'group': {
        const member = await this.groups.findActiveMember(destinationId, userId);
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
    const existing = source.forwardedFrom as Partial<ForwardedFromMetadata> | undefined;
    if (
      existing?.sourceType &&
      existing.sourceMessageId &&
      existing.sourceChatId &&
      existing.originalCreatedAt
    ) {
      return existing as Prisma.InputJsonValue;
    }

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
    if (!trimmedComment) return sourceContent;
    if (!sourceContent) return trimmedComment;
    return `${trimmedComment}\n\n${sourceContent}`;
  }

  private async buildAttachmentInputs(
    source: ForwardableMessage,
    forwarderId: string,
  ): Promise<CreateMessageAttachmentDto[]> {
    if (source.attachments.length === 0) return [];

    const copied = await Promise.all(
      source.attachments.map(async (a) => {
        const destinationKey = `forwarded/${forwarderId}/${randomUUID()}/${a.filename}`;
        await this.storage.copyObject(a.storageKey, destinationKey).catch((err) => {
          throw new BadRequestException(
            `Failed to copy attachment ${a.filename}: ${(err as Error).message}`,
          );
        });
        return {
          storageKey: destinationKey,
          fileName: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.size,
          kind: classifyAttachmentKind(a.mimeType),
        };
      }),
    );

    return copied;
  }

  private async forwardToChannel(
    channelId: string,
    content: string,
    attachments: CreateMessageAttachmentDto[],
    forwardedFrom: Prisma.InputJsonValue,
    userId: string,
  ) {
    const channel = await this.channels.findActiveById(channelId);
    if (!channel) {
      throw new NotFoundException('Destination channel not found');
    }

    return this.messagesService.create(
      channel.workspaceId,
      channelId,
      {
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      userId,
      forwardedFrom,
    );
  }

  private async forwardToDirect(
    conversationId: string,
    content: string,
    attachments: CreateMessageAttachmentDto[],
    forwardedFrom: Prisma.InputJsonValue,
    userId: string,
  ) {
    const attachmentIds =
      attachments.length > 0
        ? await this.createUnattachedAttachmentRecords(attachments, userId)
        : [];

    return this.directConversationsService.createMessage(
      conversationId,
      {
        content,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      },
      userId,
      forwardedFrom,
    );
  }

  private async forwardToGroup(
    groupId: string,
    content: string,
    attachments: CreateMessageAttachmentDto[],
    forwardedFrom: Prisma.InputJsonValue,
    userId: string,
  ) {
    const attachmentIds =
      attachments.length > 0
        ? await this.createUnattachedAttachmentRecords(attachments, userId)
        : [];

    return this.groupsService.createMessage(
      groupId,
      {
        content,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      },
      userId,
      forwardedFrom,
    );
  }

  private async createUnattachedAttachmentRecords(
    attachments: CreateMessageAttachmentDto[],
    createdById: string,
  ): Promise<string[]> {
    const created = await Promise.all(
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
          select: { id: true },
        }),
      ),
    );
    return created.map((a) => a.id);
  }
}
